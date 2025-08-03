---
title: 
description: ドメイン境界情報などを元に、ドメイン設計を行う。
---
# ドメイン設計

「ドメイン情報」をもとに、ドメイン設計を行う。
まずは粗い型定義を行う。

その際に、[全域性の原則](docs/totality.ja.md)を踏まえる。


# ドメイン情報

- 境界: `{input_text_file}`
- `docs/domain/*.md`


# 出力先

`{destination_path}` へ出力。
(`{destination_path}` がPATH形式でなければ、代わりに `tmp/design_domain_architecture/*.md`へ出力)

設計が複数ファイルへ分かれてもよい。

