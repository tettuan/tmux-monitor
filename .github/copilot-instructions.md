# GitHub Copilot Instructions

このプロジェクトは **tmux-monitor** という名前のDenoアプリケーションです。

## プロジェクト概要

- **言語**: TypeScript (Deno)
- **目的**: tmuxセッションの監視ツール
- **実行環境**: Deno 2.4.0+

## 開発ガイドライン

### コーディング規約

- **言語**: TypeScript（Denoランタイム）
- **スタイル**: Denoの標準フォーマッター（`deno fmt`）に準拠
- **インポート**: HTTPSベースのESモジュール（`https://deno.land/std/`
  など）を使用
- **権限**: 必要最小限の権限のみを指定（`--allow-net`, `--allow-read` など）

### ファイル構成

```
├── main.ts          # エントリーポイント
├── mod.ts           # モジュールエクスポート
├── src/             # ソースコード
├── tests/           # テストファイル（*_test.ts）
├── deno.json        # Deno設定
└── .github/         # GitHub設定
```

### 推奨事項

1. **外部依存関係**:
   - Deno標準ライブラリを優先的に使用
   - サードパーティライブラリは `https://deno.land/x/` から選択

2. **テスト**:
   - すべてのテストファイルは `*_test.ts` の命名規則
   - Deno標準のテストフレームワークを使用

3. **型安全性**:
   - 厳密な型チェックを有効化
   - `any` 型の使用を避ける

4. **エラーハンドリング**:
   - 明示的なエラーハンドリングを実装
   - 適切なエラーメッセージを提供

### 利用可能なコマンド

- `deno task start` - アプリケーション実行
- `deno task dev` - 開発モード（ファイル監視）
- `deno task test` - テスト実行
- `deno task fmt` - コードフォーマット
- `deno task lint` - リンティング

## 開発時の注意事項

### tmux関連の機能開発時

- tmuxコマンドは `deno run --allow-run` 権限が必要
- システムコマンドの実行時は適切なエラーハンドリングを実装
- クロスプラットフォーム対応を考慮

### セキュリティ

- 権限は最小限に制限
- 外部リソースへのアクセス時は検証を実施
- ユーザー入力のサニタイズを徹底

## コード例

### 基本的なファイル作成時のテンプレート

```typescript
// 新しいモジュールファイル
export interface Config {
  // 設定インターフェース
}

export class TmuxMonitor {
  constructor(private config: Config) {}

  async monitor(): Promise<void> {
    // 監視ロジック
  }
}
```

### テストファイルのテンプレート

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { TmuxMonitor } from "../src/monitor.ts";

Deno.test("TmuxMonitor - 基本テスト", async () => {
  const monitor = new TmuxMonitor({});
  // テストロジック
});
```

この指示書に従って、一貫性のあるコードを生成してください。
