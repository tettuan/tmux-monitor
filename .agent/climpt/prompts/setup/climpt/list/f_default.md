---
title: Climpt 実行可能コマンドの一覧作成
options: 不要
---

# 実施事項

使用可能な Climpt リストを作成する。

## Climpt とは

Deno JSR @https://jsr.io/@aidevtool/climpt である。
CLIでPromptを出力することが目的のツールである。
パラメータで渡した値をもとに、プロンプトテンプレートの変数を置換する。

通常利用時:
```zsh
climpt-* <Directive> <Layer> --*
```

STDIN利用時:
```zsh
echo "something" | climpt-* <Directive> <Layer> --*
```

使用できるプロンプトは、設定ごとにディレクトリが指定されている。
そのため、コマンドおよび設定ファイル、プロンプトファイルの存在を調べると、使用可能なコマンド一覧を作成できる。

実行可能なコマンド: `.deno/bin/climpt-*`
設定: `.agent/climpt/config/*.yml`
プロンプト: `.agent/climpt/prompts/**/f_*.md`

## プロンプト配置ルール

`.agent/climpt/prompts/<コマンド名>/<Directive>/<Layer>/f_<input>_<adaptation>.md`


## オプション一覧

input_text : STDIN
input_file : --from, -f
destination_path : --destination, -o
uv-* : --uv-*

## 手順

### 段落作成
1. `.agent/climpt/tools-list.md` を読む
2. 「実行可能なコマンド」を  `.deno/bin/climpt-*` から取得する
3. `.agent/climpt/tools-list.md` の段落に記載する
3-1. すでにあれば記載不要、なければ段落を新説

### 実行コマンド一覧作成
4. プロンプトディレクトリからファイル一覧を取得する
5. 「プロンプト配置ルール」に従い、段落へコマンドを記載する
5-1. プロンプト単位で1行とする
6. プロンプトのテンプレート内部を読み、オプションを特定する
6-1. テンプレート内部の {variable} パターンを取得する
6-2. 「オプション一覧」をもとに、利用可能な変数からオプションを判断する
7. コマンドの列に使用可を記載する

### 詳細説明の作成
8. フロントマターがあれば、title, description, usage, options を取得する
9. 一覧表の下に、実行コマンドごとの詳細説明を記載する。

## フォーマット

書式は以下である。構造は「JSONスキーマ」を参照すること。

`````
## climpt-design

|directive| layer | input(-i) | adaptation(-a) | input_text_file(-f) | input_text (STDIN) |destination(-o) | 
|--- |---|--- |---|--- |---| ---|
| domain | architecture | - | detail | ✓ | ✓ | - |
| domain | architecture | - | core | ✓ | ✓ | - |
| domain | boundary | - | subdomain | - | - | ✓ |

**climpt-design domain architecture --name=value**:
ここにフロントマターのタイトル
ここにフロントマターの説明文。
input_text: 今回のスコープを指定する
input_text_file: ざっくり説明された情報を受け取る
destination_path: 出力先を複数ファイルで指定 
uv-subdomain: サブドメインのprefixを指定する
`````

```:NG, 2 prompt file in one line.
| domain | architecture | | detail, core | ok | ok | |
```

## 出力先

`.agent/climpt/tools-list.md`


# JSONスキーマ

以下は、作成するアウトプットの構造を定義するJSONスキーマです。

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Climpt Tools List Output Schema",
  "type": "object",
  "properties": {
    "commands": {
      "type": "array",
      "description": "実行可能なClimptコマンドの一覧",
      "items": {
        "type": "object",
        "properties": {
          "commandName": {
            "type": "string",
            "description": "コマンド名（例: climpt-design）",
            "pattern": "^climpt-[a-z0-9-]+$"
          },
          "options": {
            "type": "array",
            "description": "利用可能なオプションの組み合わせ",
            "items": {
              "type": "object",
              "properties": {
                "directive": {
                  "type": "string",
                  "description": "ディレクティブ名（例: domain）"
                },
                "layer": {
                  "type": "string",
                  "description": "レイヤー名（例: architecture, boundary）"
                },
                "inputOption": {
                  "type": "boolean",
                  "description": "input(-i)オプションの利用可否"
                },
                "adaptationOption": {
                  "type": "string",
                  "description": "adaptation(-a)オプションの値（例: detail, core, subdomain）"
                },
                "inputTextFileOption": {
                  "type": "boolean",
                  "description": "input_text_file(-f)オプションの利用可否"
                },
                "inputTextStdin": {
                  "type": "boolean",
                  "description": "input_text (STDIN)の利用可否"
                },
                "destinationOption": {
                  "type": "boolean",
                  "description": "destination(-o)オプションの利用可否"
                }
              },
              "required": ["directive", "layer", "inputOption", "adaptationOption", "inputTextFileOption", "inputTextStdin", "destinationOption"]
            }
          },
          "promptDetails": {
            "type": "array",
            "description": "プロンプトファイル単位の詳細説明",
            "items": {
              "type": "object",
              "properties": {
                "promptKey": {
                  "type": "string",
                  "description": "プロンプトの識別キー（例: 'domain architecture --adaptation=detail'）",
                  "pattern": "^[a-z]+ [a-z]+ --[a-z_]+=\\w+$"
                },
                "frontmatter": {
                  "type": "object",
                  "description": "プロンプトファイルのフロントマター情報",
                  "properties": {
                    "title": {
                      "type": "string",
                      "description": "フロントマターのタイトル"
                    },
                    "description": {
                      "type": "string",
                      "description": "フロントマターの説明文"
                    }
                  },
                  "required": ["title", "description"]
                },
                "variables": {
                  "type": "object",
                  "description": "プロンプトで使用される変数（オプションで値が渡される）の説明",
                  "additionalProperties": {
                    "type": "string",
                    "description": "変数の説明文"
                  },
                  "examples": [
                    {
                      "input_text": "今回のスコープを指定する",
                      "input_text_file": "ざっくり説明された情報を受け取る",
                      "destination_path": "出力先を複数ファイルで指定",
                      "uv-subdomain": "サブドメインのprefixを指定する"
                    }
                  ]
                }
              },
              "required": ["promptKey", "frontmatter", "variables"]
            }
          }
        },
        "required": ["commandName", "options", "promptDetails"]
      }
    }
  },
  "required": ["commands"]
}
```

