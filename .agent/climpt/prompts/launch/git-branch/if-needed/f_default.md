---
title: git branch の新規立ち上げ判断と、新ブランチ作成
input_text: 今回の作業内容を30文字以内で指定
---
指示「採用ステップ」に基づき、どのGitブランチ名を採用するか、定める。採用ステップを実行した後に、ブランチの作成判断と移動を行うこと。そのまま現在のブランチを採用する可能性もある。

# Git ブランチ戦略
まず最初に、 `docs/claude/git-workflow.md` を読んで把握すること。 

# 採用ステップ

1. 現在のブランチ名を取得する(branch-A)
2. 「今回の作業内容」に相応しいブランチ名を考える(branch-B)
3. [branch-A]が `main`,`develop` であれば、必ず2を採用する
4. 「近さ基準」に基づき、branch-A or branch-B を決める
5. 決めたブランチへ移動する

# 今回の作業内容
{input_text}

# 類似度判定

以下のスクリプトで実行：

```bash
./scripts/git-branch-similarity.sh "<branch-A>" "<branch-B>"
```

- **閾値: 0.7**
- `similarity_score < 0.7` → 新ブランチ作成(branch-B)
- `similarity_score >= 0.7` → 現在のブランチで継続(branch-A)
