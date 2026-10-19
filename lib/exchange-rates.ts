export const WALLET_CURRENCY_OPTIONS = [
    { code: "CNY", region: "中国大陆", label: "人民币" }, { code: "USD", region: "美国", label: "美元" },
    { code: "EUR", region: "欧元区", label: "欧元" }, { code: "GBP", region: "英国", label: "英镑" },
    { code: "JPY", region: "日本", label: "日元" }, { code: "KRW", region: "韩国", label: "韩元" },
    { code: "HKD", region: "中国香港", label: "港币" }, { code: "TWD", region: "中国台湾", label: "新台币" },
    { code: "CAD", region: "加拿大", label: "加元" }, { code: "AUD", region: "澳大利亚", label: "澳元" },
] as const;
const CURRENCIES = new Set<string>(WALLET_CURRENCY_OPTIONS.map(item => item.code));
export function supportedCurrency(value: unknown): string { const code = normalizeCurrency(value); return CURRENCIES.has(code) ? code : "CNY"; }
export function normalizeCurrency(value: unknown): string { return String(value || "CNY").trim().toUpperCase(); }
export function currencySymbol(code: string): string { return ({ CNY: "¥", USD: "$", EUR: "€", GBP: "£", JPY: "¥", KRW: "₩", HKD: "HK$", TWD: "NT$", CAD: "C$", AUD: "A$" } as Record<string,string>)[code] || code; }
export async function fetchExchangeRate(currency: string, targetCurrency: string): Promise<number | null> {
    const code = normalizeCurrency(currency), target = normalizeCurrency(targetCurrency);
    if (!CURRENCIES.has(code) || !CURRENCIES.has(target)) return null;
    if (code === target) return 1;
    try { const r = await fetch(`https://open.er-api.com/v6/latest/${code}`, { signal: AbortSignal.timeout(8000) }); if (!r.ok) return null; const j = await r.json(); const rate = Number(j?.rates?.[target]); return j.result === "success" && j.base_code === code && Number.isFinite(rate) && rate > 0 ? rate : null; } catch { return null; }
}
export function fetchCnyRate(currency: string) { return fetchExchangeRate(currency, "CNY"); }
export function cnyAmount(amount: number, rate: number): number { return Math.round(amount * rate * 100) / 100; }
