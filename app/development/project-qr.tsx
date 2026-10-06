import QRCode from "qrcode";
import { projectUrl } from "@/lib/development/policy";

export async function ProjectQr({ url }: { url: string | null }) {
  const safeUrl = projectUrl(url);
  if (!safeUrl) return null;
  let image: string;
  try {
    image = await QRCode.toDataURL(safeUrl, {
      errorCorrectionLevel: "M", margin: 4, scale: 8,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {
    return <p role="status">QRコードを生成できませんでした。利用・確認用リンクをご利用ください。</p>;
  }
  return <details className="development-qr" key={safeUrl}>
    <summary>利用・確認用QRコード</summary>
    <img src={image} alt="登録済みの利用・確認用URLのQRコード" width={320} height={320} />
    <a href={safeUrl} target="_blank" rel="noopener noreferrer">{safeUrl}</a>
  </details>;
}
