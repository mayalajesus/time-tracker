const rememberKey = "minvio:remember-session";

export function setRememberSession(remember: boolean) {
  window.localStorage.setItem(rememberKey, String(remember));
}

export const authStorage = {
  getItem(key: string) {
    return window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    const remember = window.localStorage.getItem(rememberKey) !== "false";
    const target = remember ? window.localStorage : window.sessionStorage;
    const other = remember ? window.sessionStorage : window.localStorage;
    target.setItem(key, value);
    other.removeItem(key);
  },
  removeItem(key: string) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};
