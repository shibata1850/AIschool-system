# 採点JSONのローカルE2E

Windows x64用。通常のPowerShellでこのフォルダへ移動して実行する。
リポジトリ直下でも事前に `npm ci` が必要。

```powershell
npm install --ignore-scripts --no-audit --no-fund
npm test
```

毎回新規のlocalhost専用PostgreSQLにマイグレーションを適用し、
架空データの初期化を含むE2Eを実行する。本番DBや実APIへは接続しない。
Claude SDKの接続先はローカル模擬API。実APIの品質・速度を証明する試験ではない。
リポジトリに実環境の.envファイルが存在すると停止する。
Edgeを検出できなければ `PLAYWRIGHT_CHROMIUM_PATH` にテスト用Chromiumを指定する。
通常のPlaywrightスイートとは専用configで分離している。

終了時はDBを停止するがローカルDBファイルは保持する。
結果はリポジトリの `test-results/grading-report.json`。
本番への転用、実DBへの接続、実トークンの設定は禁止。

2026-09-10検証: 単体285件、修正後E2E12件合格。
同じE2Eを修正前の別コピーで実行すると、コード囲みJSONは2画面とも失敗し、
通常JSONは2画面とも成功した。候補作成後の比較検証であり、実施順序はこの通り。
