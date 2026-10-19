"use client";
import { useEffect, useState } from "react";
import { listIdentityRecoveryPoints, restoreIdentityRecoveryPoint } from "@/lib/identity-recovery";

export default function IdentityRecoveryPage() {
  const [points, setPoints] = useState<Array<{ id: string; createdAt: string }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void listIdentityRecoveryPoints().then(setPoints).catch(() => setError("无法读取恢复点")); }, []);
  const restore = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try { await restoreIdentityRecoveryPoint(selected); window.location.href = "/"; }
    catch (error) { setError(error instanceof Error ? error.message : "恢复失败"); setBusy(false); }
  };
  return <main className="min-h-screen bg-white p-6 text-slate-900 dark:bg-slate-950 dark:text-white">
    <div className="mx-auto max-w-md space-y-5">
      <a href="/" className="text-blue-500">返回手机</a>
      <h1 className="text-xl font-semibold">身份调整前的数据恢复点</h1>
      <p className="text-sm text-slate-500">恢复会替换此浏览器中的手机数据。请先关闭其他 Float 页面。已删除身份的数据不会从恢复点复活。</p>
      {points.map(point => <button key={point.id} disabled={busy} onClick={() => setSelected(point.id)} className="w-full rounded-2xl border border-slate-200 p-4 text-left dark:border-slate-700">{new Date(point.createdAt).toLocaleString("zh-CN")}</button>)}
      {!points.length && <p>当前浏览器没有恢复点。</p>}
      {selected && <div role="alertdialog" className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800">
        <p className="mb-4">确认恢复到所选时间？当前数据会被替换。</p>
        <button disabled={busy} onClick={() => void restore()} className="rounded-xl bg-blue-500 px-4 py-2 text-white">{busy ? "恢复中…" : "确认恢复"}</button>
        <button disabled={busy} onClick={() => setSelected(null)} className="ml-4">取消</button>
      </div>}
      {error && <p role="alert" className="text-red-500">{error}</p>}
    </div>
  </main>;
}
