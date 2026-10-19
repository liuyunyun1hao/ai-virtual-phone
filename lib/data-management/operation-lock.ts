let running = false;
/** File and cloud operations share one lock, including other tabs where Web Locks exists. */
export async function withBackupOperation<T>(task: () => Promise<T>): Promise<T> {
  if (running) throw new Error("已有备份或恢复正在运行，请等待完成");
  running = true;
  try {
    if (typeof navigator === "undefined" || !navigator.locks) return await task();
    return await navigator.locks.request("float-data-backup-restore", { ifAvailable: true }, lock => {
      if (!lock) throw new Error("其他页面正在备份或恢复，请等待完成");
      return task();
    });
  } finally { running = false; }
}
