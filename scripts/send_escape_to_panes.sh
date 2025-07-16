#!/bin/bash

# tmuxの全ペインにEscapeキーを送信するスクリプト
# 使用例: ./send_escape_to_panes.sh [session_name]

set -euo pipefail

# セッション名が指定されていない場合は現在のセッションを使用
SESSION_NAME="${1:-$(tmux display-message -p '#S' 2>/dev/null || echo '')}"

# tmuxが実行されているかチェック
if ! tmux list-sessions >/dev/null 2>&1; then
    echo "Error: tmuxが実行されていません" >&2
    exit 1
fi

# セッションが存在するかチェック
if [[ -n "$SESSION_NAME" ]] && ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Error: セッション '$SESSION_NAME' が見つかりません" >&2
    exit 1
fi

# セッション指定がある場合はそのセッションのペインのみ対象
if [[ -n "$SESSION_NAME" ]]; then
    PANE_FILTER="-t $SESSION_NAME"
else
    PANE_FILTER=""
fi

echo "Escapeキーを送信中..."

# 全ペインを取得してEscapeキーを送信
tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index}' $PANE_FILTER | while read -r pane; do
    if [[ -n "$pane" ]]; then
        echo "  -> $pane"
        # 最初のEscape
        if tmux send-keys -t "$pane" Escape 2>/dev/null; then
            sleep 0.1
            # 2回目のEscape（確実にコマンドモードから抜ける）
            tmux send-keys -t "$pane" Escape 2>/dev/null || true
        else
            echo "    Warning: ペイン $pane への送信に失敗しました" >&2
        fi
    fi
done

echo "完了しました。"
