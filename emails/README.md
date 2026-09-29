# E-mail de recuperação

O arquivo `password-recovery.html` é o template de recuperação do Supabase de produção.

- Assunto: **Redefina sua senha — Time Tracker**
- Idioma do e-mail: português (Brasil).
- No painel Supabase, abra **Authentication → Email Templates → Reset Password** e configure o assunto e o HTML deste arquivo.
- Preserve `{{ .ConfirmationURL }}` no botão e no link alternativo. O Supabase gera o link seguro com o redirecionamento solicitado pela aplicação.
- Alterar este arquivo não publica automaticamente o template. Ao atualizá-lo, publique também a configuração do provedor.
- Este template não configura o Neon de homologação.

Não inclua credenciais ou links de recuperação reais neste diretório. A aplicação não faz envios adicionais pelo servidor; o Supabase continua responsável pelos tokens, envio e limites de solicitações.
