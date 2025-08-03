---
title: 
description:
variables:
  uv-scope: ドメイン設計のアーキテクチャを再設計する。
---

# プロジェクト: ドメイン駆動設計の再設計

実装方針:
ドメイン設計の設計自体を、堅牢になるようリファクタリングする。ドメイン領域の理解に基づき、要求をベースに、型安全性を強化して、骨格が通った芯の強いコード実装を再設計する。

`Totality` について、必ず `docs/totality.ja.md` を参照すること。
ドメイン情報は、 `docs/domain/domain_driven_design.md` および `docs/domain/domain_boundary.md` を必ず読むこと。
要求は、`docs/requirements.md` に記載がある。

なお、AI実装複雑化防止フレームワーク(`docs/ai-complexity-control_compact.ja.md`)に則り、エントロピー増大を抑制すること。

## 実施内容

1. 資料を読んで、ドメイン設計と Totality を理解する。
1-1. 24回シミュレーション試行回数で最も多く通る線が「骨格の中心線」である
1-2. ライフタイムが最も長い「骨格の中心線」が「中核」である
2. `docs/domain/architecture.md` をシンプルで骨格の中心線が通った設計へ、再設計する。
2-1. 「中核」から書き始める
2-2. シンプルな「中核」の中心線を作成し、境界線を明らかにする
2-3. 中核以外の中心線を書き込む
3. 周辺のドメインを、境界線を明らかにしながら記載する

## 完了条件

1. ドメイン駆動設計とTotalityに基づいた再設計が完了した
2. `docs/domain/architecture.md` が再設計された
