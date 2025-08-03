---
title: 
description: ドメイン境界情報などを元に、ドメイン設計を行う。既存のドメイン情報を加味して詳細な型定義を行う。
---
# ドメイン設計

「ドメイン情報」をもとに、ドメイン設計を行う。
実装情報を加味した、詳細な型定義を行う。


## 設計方針
- [全域性の原則](docs/totality_go.ja.md)を踏まえる。

# ドメイン情報

- ベースのドメイン情報: `docs/domain/*.md`
- 新しいドメイン情報: `{input_text_file}`
- 実装: Serena MCP で調査

# 出力先

`{destination_path}` へ出力。
(`{destination_path}` がPATH形式でなければ、代わりに `tmp/design_domain_architecture_detail/*.md`へ出力)

設計が複数ファイルへ分かれてもよい。

