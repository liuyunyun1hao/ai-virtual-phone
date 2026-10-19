import { loadWalletState } from "./wallet-storage";
import { supportedCurrency, WALLET_CURRENCY_OPTIONS } from "./exchange-rates";

export function walletCurrencyInstruction(): string {
  const code = supportedCurrency(loadWalletState().currency);
  const option = WALLET_CURRENCY_OPTIONS.find(item => item.code === code)!;
  return `【用户钱包事实】用户钱包地区/币种：${option.region} / ${code}。这是用户收付款币种，不代表角色所在地或角色币种。跨币种兑换由代码查询汇率，模型不要编造或计算汇率。`;
}

export const CHARACTER_CURRENCY_INSTRUCTION = `【角色地区与币种】根据角色人设、常住地、财务背景和当前明确情境判断当地币种，不根据名字、界面语言或用户钱包猜测国籍。无法确定角色所在地或币种时用 CNY。可用 CNY/USD/EUR/GBP/JPY/KRW/HKD/TWD/CAD/AUD；无法确定支持的币种时用 CNY。转账原金额、购物价格及资产余额/流水都应标明实际币种；不同角色可以不同。角色资产和查手机购物属于角色当地经济，不改成用户钱包币种。`;

export function shoppingCurrencyInstruction(): string {
  const code = supportedCurrency(loadWalletState().currency);
  return `【购物计价】当前用户购物地区/币种为 ${code}。新生成的所有商品 [价格] 必须使用 ${code} 加数字（例如 ${code} 100.00），按该地区合理定价；不要默认人民币，不编造汇率。商品历史价格保持原币，实际跨币种支付由代码换算。`;
}

export function amountCurrency(label: string, fallback = "CNY"): string {
  const code = label.toUpperCase().match(/\b(CNY|USD|EUR|GBP|JPY|KRW|HKD|TWD|CAD|AUD)\b/)?.[1];
  if (code) return code;
  if (/HK\$/i.test(label)) return "HKD";
  if (/NT\$/i.test(label)) return "TWD";
  if (/C\$/i.test(label)) return "CAD";
  if (/A\$/i.test(label)) return "AUD";
  if (label.includes("€")) return "EUR";
  if (label.includes("£")) return "GBP";
  if (label.includes("₩")) return "KRW";
  if (label.includes("$")) return "USD";
  return supportedCurrency(fallback);
}

export function moneyNumber(label: string): number {
  const value = label.replace(/[,，\s]/g, "").match(/[+-]?\d+(?:\.\d+)?/)?.[0];
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function sumMoneyByCurrency(items: Array<{ amount: string; currency: string }>, signed = false): string {
  const totals = new Map<string, number>();
  for (const item of items) {
    const numeric = moneyNumber(item.amount);
    const value = item.amount.trim().startsWith("-") ? -Math.abs(numeric) : numeric;
    totals.set(item.currency, (totals.get(item.currency) || 0) + value);
  }
  return [...totals].map(([code, amount]) => `${signed && amount >= 0 ? "+" : ""}${code} ${amount.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`).join(" / ") || "CNY 0";
}
