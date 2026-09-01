export const dynamic = "force-dynamic";

/**
 * S4 Jupyter演習（docs/画面仕様書.md S4）。
 * JupyterHub（校内GPUサーバー）へのワンタップ導線。本人確認はLTIで済むため再ログイン不要
 * （JupyterHub側を jupyterhub-ltiauthenticator でCanvasのLTIツールとして構成する）。
 * - JUPYTERHUB_URL 未設定: 準備中の案内
 * - JUPYTER_FALLBACK_URL: GPUサーバー停止時の静的教材モードへの導線（F2例外3）
 * JupyterHub本体の構築は docs/JupyterHub構築手順.md（Cowork作業）。
 */
export default function JupyterPage() {
  const hubUrl = process.env.JUPYTERHUB_URL;
  const fallbackUrl = process.env.JUPYTER_FALLBACK_URL;

  return (
    <main>
      <h1>Jupyter（ジュピター）演習</h1>

      {hubUrl ? (
        <>
          <p className="lead">
            下のボタンを押すと、あなたの演習ノートブックが開きます（ログインし直しは不要です）。
          </p>
          <div className="actions">
            <a
              className="button button--primary"
              href={hubUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              演習をはじめる
            </a>
          </div>
          <p className="muted" style={{ marginTop: "1rem" }}>
            準備に少し時間がかかることがあります（「起動中…」と表示されたらお待ちください）。
          </p>

          <section aria-label="うまく開かないとき" style={{ marginTop: "1.5rem" }}>
            <h2>うまく開かないとき</h2>
            <p className="muted">
              演習マシンが混んでいたり止まっているときは、下から静的な教材で学習を続けられます。
            </p>
            {fallbackUrl ? (
              <div className="actions">
                <a className="button" href={fallbackUrl} target="_blank" rel="noopener noreferrer">
                  静的教材をひらく
                </a>
              </div>
            ) : (
              <p className="muted">（静的教材は準備中です。講師にご確認ください）</p>
            )}
          </section>
        </>
      ) : (
        <div className="banner" aria-label="準備中">
          <p className="banner__title">演習マシン（JupyterHub）は、まだ準備中です</p>
          <p className="muted">講師の案内をお待ちください。準備ができると、ここに「演習をはじめる」ボタンが表示されます。</p>
        </div>
      )}
    </main>
  );
}
