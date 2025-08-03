# Climpt Tools List

## 実行可能なコマンド

以下のコマンドが `.deno/bin/` に配置されています：

- `climpt-commit`
- `climpt-launch`
- `climpt-refactor`
- `climpt-setup`

## climpt-commit

|directive| layer | input(-i) | adaptation(-a) | input_text_file(-f) | input_text (STDIN) |destination(-o) | 
|--- |---|--- |---|--- |---| ---|
| semantic | units | - | default | - | - | - |

**climpt-commit semantic units**:
意味的近さでコミットを分けて実施する
Gitコミットを、ファイルの変更内容の近さ単位でグループ化し、近い単位にまとめてコミットする。まったく異なる内容を1つのコミットへ含めることを避けつつ、複数回のコミット処理を連続して実行することが目的である。

## climpt-launch

|directive| layer | input(-i) | adaptation(-a) | input_text_file(-f) | input_text (STDIN) |destination(-o) | 
|--- |---|--- |---|--- |---| ---|
| git-branch | if-needed | ✓ | default | - | ✓ | - |
| claude-company | using-tmux | - | default | - | - | - |

**climpt-launch git-branch if-needed**:
git branch の新規立ち上げ判断と、新ブランチ作成
指示「採用ステップ」に基づき、どのGitブランチ名を採用するか、定める。採用ステップを実行した後に、ブランチの作成判断と移動を行うこと。そのまま現在のブランチを採用する可能性もある。
input_text: 今回の作業内容を30文字以内で指定

**climpt-launch claude-company using-tmux**:
tmuxを使った相互通信によるClaude Code Company管理方法
tmuxの複数paneでClaude Codeインスタンスを並列実行し、効率的にタスクを分散処理する方法。

## climpt-refactor

|directive| layer | input(-i) | adaptation(-a) | input_text_file(-f) | input_text (STDIN) |destination(-o) | 
|--- |---|--- |---|--- |---| ---|
| basedon | ddd | - | default | - | - | - |
| basedon | ddd | ✓ | nextaction | - | ✓ | - |

**climpt-refactor basedon ddd**:
ドメイン駆動設計と全域性（Totality）の融合完成
現在の実装をドメイン駆動設計と全域性（Totality）による設計で、堅牢になるようリファクタリングする。ドメイン領域の明確な理解に基づき、型安全性を強化して、骨格が通った芯の強いコード実装を実現する。
uv-scope: 対象範囲の単語での指定(CSV取り込み処理、など)。ドメイン領域、サブドメイン領域。

**climpt-refactor basedon ddd --adaptation=nextaction**:
ドメイン駆動設計と全域性（Totality）の融合完成（ネクストアクション）
リファクタリング継続の指示である。「ネクストアクション」を実施する。
uv-scope: 実行済の結果から導き出したネクストアクションを進める。その際に、基本事項を維持した状態で、次アクションを指示する。
input_text: ネクストアクションの指示書

## climpt-setup

|directive| layer | input(-i) | adaptation(-a) | input_text_file(-f) | input_text (STDIN) |destination(-o) | 
|--- |---|--- |---|--- |---| ---|
| climpt | list | - | default | - | - | - |

**climpt-setup climpt list**:
Climpt 実行可能コマンドの一覧作成
使用可能な Climpt リストを作成する。CLIでPromptを出力することが目的のツールである。パラメータで渡した値をもとに、プロンプトテンプレートの変数を置換する。
