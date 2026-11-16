// Пути, открытые без входа: вход, возврат из Google и политика конфиденциальности.
export const isPublicPath = (pathname: string) => pathname === "/login" || pathname === "/privacy" || pathname.startsWith("/auth/");
