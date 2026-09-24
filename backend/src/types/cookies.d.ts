declare module "cookies" {
  type CookieOptions = {
    httpOnly?: boolean;
    sameSite?: "lax" | "strict" | "none";
    secure?: boolean;
    maxAge?: number;
  };

  class Cookies {
    constructor(request: unknown, response: unknown);
    get(name: string): string | undefined;
    set(name: string, value: string, options?: CookieOptions): void;
  }

  export default Cookies;
}