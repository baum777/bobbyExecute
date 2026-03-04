export interface TradeIntentV1 {
  schema_version: "trade.intent.v1";
  decision_id: string;
  token: string;
  side: "BUY" | "SELL";
  amount: number;
  slippage_bps: number;
  route?: string;
}

export interface TradeExecutionV1 {
  schema_version: "trade.exec.v1";
  decision_id: string;
  tx_sig: string;
  filled_amount: number;
  avg_price: number;
  fees_paid: number;
  slippage_bps_realized: number;
  ts_ms: number;
}
