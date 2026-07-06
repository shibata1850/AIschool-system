export const dynamic = "force-dynamic";

/**
 * S4 Jupyter演習（docs/画面仕様書.md S4）。
 * JupyterHub（校内GPUサーバー）へのワンタップ導線。参照実装では接続先を環境変数で
 * 指定し、未設定時は準備中の案内を表示する。本番はLTI連携で再ログイン不要にする。
 */
export default function JupyterPage() {
  const hubUrl = process.env.JUPYTERHUB_URL;

  return (
    <main>
      <h1>Jupyter（ジュピター）演習</h1>
      {hubUrl ? (
        <>
          <p style={{ marginBottom: "1.5rem" }}>
            下のボタンを押すと、演習用のノートブックが開きます。
          </p>
          <a className="button" href={hubUrl} style={{ display: "inline-block", textDecoration: "none" }}>
            演習をはじめる
          </a>
        </>
      ) : (
        <p aria-label="準備中">
          演習マシン（JupyterHub）は、まだ準備中（じゅんびちゅう）です。先生の案内を待ってね。
        </p>
      )}
    </main>
  );
}
