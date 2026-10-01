import { transactionalEmail } from "./email-templates.mjs";

export async function queueEmail(
  client,
  { key, kind, userId, invitationId = null, recipient, payload },
) {
  const result = await client.query(
    `insert into public.transactional_emails
    (operation_key, kind, user_id, invitation_id, recipient, payload)
    values ($1,$2,$3,$4,$5,$6::jsonb) on conflict (operation_key) do nothing returning id`,
    [key, kind, userId, invitationId, recipient, JSON.stringify(payload)],
  );
  if (result.rows[0]) return result.rows[0].id;
  return (
    await client.query("select id from public.transactional_emails where operation_key=$1", [key])
  ).rows[0].id;
}

export async function sendQueuedEmail(client, config, id) {
  if (!config.mailjet.enabled) return "disabled";
  // A previous process might have stopped after Mailjet accepted the message.
  await client.query(
    `update public.transactional_emails set status='unknown', error_code='interrupted', updated_at=now()
    where id=$1 and status='sending' and updated_at < now() - interval '2 minutes'`,
    [id],
  );
  const claimed = await client.query(
    `update public.transactional_emails set status='sending', attempts=attempts+1, updated_at=now()
    where id=$1 and attempts<5 and (status='pending' or (status='failed' and kind='welcome' and next_attempt_at<=now()))
    returning *`,
    [id],
  );
  const event = claimed.rows[0];
  if (!event)
    return (
      (await client.query("select status from public.transactional_emails where id=$1", [id]))
        .rows[0]?.status ?? "failed"
    );
  let status = "failed";
  let errorCode = "configuration";
  let messageId = null;
  let retry = false;
  try {
    if (!config.mailjet.apiKey || !config.mailjet.secretKey || !config.mailjet.fromEmail)
      throw new Error("configuration");
    const template = transactionalEmail(event.kind, event.payload);
    if (new URL(event.payload.url).protocol !== "https:") throw new Error("configuration");
    const response = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${config.mailjet.apiKey}:${config.mailjet.secretKey}`).toString("base64")}`,
      },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: config.mailjet.fromEmail, Name: config.mailjet.fromName },
            To: [{ Email: event.recipient }],
            Subject: template.subject,
            HTMLPart: template.html,
            TextPart: template.text,
            CustomID: event.id,
            TrackOpens: "disabled",
            TrackClicks: "disabled",
          },
        ],
      }),
    });
    const body = await response.json().catch(() => null);
    const message = body?.Messages?.[0];
    if (response.ok && message?.Status === "success") {
      status = "accepted";
      errorCode = null;
      messageId = String(message.To?.[0]?.MessageUUID ?? message.To?.[0]?.MessageID ?? "");
    } else if (response.status === 429) {
      errorCode = "rate_limit";
      retry = true;
    } else if (message?.Status === "error" && message.Errors?.length) {
      // An explicit rejection is safe to retry; an ambiguous response is not.
      const errors = message.Errors;
      retry = errors.every((error) => error.StatusCode === 429 || error.StatusCode >= 500);
      errorCode = retry ? "temporary_rejection" : "message_rejected";
    } else if (response.status >= 500 || response.ok) {
      status = "unknown";
      errorCode = "ambiguous_response";
    } else {
      errorCode = `http_${response.status}`;
    }
  } catch (error) {
    if (error.message !== "configuration") {
      status = "unknown";
      errorCode = "network_or_timeout";
    }
  }
  const delaySeconds = [60, 300, 1800, 7200, 0][event.attempts - 1];
  await client.query(
    `update public.transactional_emails set status=$2, message_id=$3, error_code=$4,
    next_attempt_at=case when $5::boolean then now()+($6::int * interval '1 second') else null end, updated_at=now() where id=$1`,
    [id, status, messageId, errorCode, retry && event.attempts < 5, delaySeconds],
  );
  return status;
}

export async function welcomeOnAccess(client, user, config) {
  if (!config.mailjet.enabled) return;
  try {
    const id = await queueEmail(client, {
      key: `welcome:${user.id}`,
      kind: "welcome",
      userId: user.id,
      recipient: user.email,
      payload: { name: user.name || "bem-vindo", url: new URL("/tracker", config.appUrl).href },
    });
    await sendQueuedEmail(client, config, id);
  } catch {
    // Email failures must not block authenticated account access or expose PII.
    console.error("[transactional-email] welcome processing failed");
  }
}

export async function deliverInvitation(client, config, id) {
  try {
    return await sendQueuedEmail(client, config, id);
  } catch {
    console.error("[transactional-email] invitation processing failed");
    return "unknown";
  }
}
