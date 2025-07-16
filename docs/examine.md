# tmux-monitor テスト実行ガイド

このドキュメントは、tmux-monitorアプリケーションの包括的なテストを実行するためのガイドです。
Domain-Driven Design (DDD) とイベント駆動アーキテクチャの実装を検証します。

## 📋 テスト実行手順

### 前提条件

```bash
# tmuxが実行中であることを確認
tmux list-sessions

# 複数のペインが存在することを確認
tmux list-panes -a

# Denoプロジェクトのセットアップ確認
cd /Users/tettuan/github/tmux-monitor
deno --version
```

## 🎯 テストケース一覧

### 1. 基本機能テスト

#### 1.1 単発監視モード（--onetime）

**実行コマンド:**
```bash
timeout 30s deno task start --onetime
```

**成功の定義:**
- [ ] tmuxペインが正常に検出される
- [ ] ペインの状態（IDLE/WORKING/DONE/UNKNOWN）が正しく抽出される
- [ ] 監視が1サイクルで終了する
- [ ] 統計情報が正確に表示される
- [ ] エラーなく終了する（終了コード: 0）

**検証ポイント:**
```
✅ 期待する出力例:
[INFO] Discovered X panes from tmux
[INFO] 🎯 Initial state: X total panes, Y working, Z idle
✅ Pane %N self-updated: STATUS → STATUS
```

#### 1.2 継続監視モード（デフォルト）

**実行コマンド:**
```bash
timeout 60s deno task start
```

**成功の定義:**
- [ ] 継続的な監視ループが動作する
- [ ] 各サイクルでペインの状態が更新される
- [ ] イベント駆動アーキテクチャが正常に動作する
- [ ] メモリリークが発生しない
- [ ] タイムアウトで正常終了する

**検証ポイント:**
```
✅ 期待する出力例:
[INFO] 📊 Cycle N (Phase): X status changes
🔍 DEBUG: Extracting status from title: "..."
✅ Pane %N self-updated: OLD_STATUS → NEW_STATUS
```

### 2. 時間指定実行テスト

#### 2.1 現在時刻+1分後の指定

**実行コマンド:**
```bash
# 現在時刻+1分を計算して実行
NEXT_TIME=$(date -d '+1 minute' '+%H:%M')
timeout 120s deno task start --time=$NEXT_TIME --onetime
```

**成功の定義:**
- [ ] スケジュール時刻まで待機する
- [ ] 指定時刻に監視が開始される
- [ ] Tokyo時間で正確に実行される
- [ ] 単発実行で終了する

#### 2.2 過去時刻指定（翌日実行）

**実行コマンド:**
```bash
timeout 10s deno task start --time=23:59 --onetime
```

**成功の定義:**
- [ ] 過去時刻が翌日として解釈される
- [ ] 適切なスケジュール情報が表示される
- [ ] タイムアウトで正常終了する

### 3. 指示書実行テスト

#### 3.1 指示書ファイル作成と実行

**準備:**
```bash
# テスト用指示書作成
cat > tmp/test_instruction.txt << 'EOF'
# テスト用指示書
echo "Hello from instruction file"
ls -la
pwd
EOF
```

**実行コマンド:**
```bash
timeout 60s deno task start --instruction=tmp/test_instruction.txt --onetime
```

**成功の定義:**
- [ ] 指示書ファイルが正常に読み込まれる
- [ ] 指示内容がターゲットペインに送信される
- [ ] ファイルが存在しない場合のエラーハンドリングが正常

#### 3.2 時間指定 + 指示書の組み合わせ

**実行コマンド:**
```bash
FUTURE_TIME=$(date -d '+30 seconds' '+%H:%M')
timeout 90s deno task start --time=$FUTURE_TIME --instruction=tmp/test_instruction.txt --onetime
```

**成功の定義:**
- [ ] 指定時刻まで待機
- [ ] 時刻到達後に指示書が実行される
- [ ] 組み合わせオプションが正常に動作する

### 4. ペイン管理テスト

#### 4.1 ペイン一覧表示

**実行コマンド:**
```bash
timeout 30s deno task start --list-panes
```

**成功の定義:**
- [ ] 全ペインが一覧表示される
- [ ] 各ペインの詳細情報が表示される
- [ ] アクティブペインが識別される
- [ ] ペイン名が正確に割り当てられる
- [ ] ペインがID順（%0, %1, %2, ...）で並んで表示される

**検証ポイント:**
```
# アプリケーションが出力するペイン一覧の並び順を確認
# 期待する出力順序（ID昇順）:
Pane %0: [STATUS] name1: title1
Pane %1: [STATUS] name2: title2  
Pane %2: [STATUS] name3: title3
Pane %4: [STATUS] name4: title4
...

# 確認事項:
✅ ペインIDが %0, %1, %2, ... の順で表示される
✅ %3が存在しない場合でも %4以降が正しく並ぶ
✅ ペインIDの数値部分でソートされている
❌ 文字列ソート（%10が%2の前に来る）ではない
```

#### 4.2 ペインクリア機能

**4.2.1 基本クリア機能テスト**

**準備:**
```bash
# 各ペインにテスト用のコンテンツを配置
for pane_id in $(tmux list-panes -a -F "#{pane_id}" | grep -v "%0"); do
  tmux send-keys -t "$pane_id" "echo 'Test content before clear - Pane $pane_id'" C-m 2>/dev/null || true
  tmux send-keys -t "$pane_id" "echo 'Line 2 for pane $pane_id'" C-m 2>/dev/null || true
  tmux send-keys -t "$pane_id" "echo 'Line 3 for pane $pane_id'" C-m 2>/dev/null || true
done

# クリア前のペイン内容を記録
echo "=== クリア前のペイン内容 ==="
for pane_id in $(tmux list-panes -a -F "#{pane_id}"); do
  echo "--- Pane $pane_id ---"
  tmux capture-pane -t "$pane_id" -p 2>/dev/null || echo "Failed to capture $pane_id"
done
```

**実行コマンド:**
```bash
timeout 30s deno task start --clear --onetime
```

**検証:**
```bash
# クリア後のペイン内容を確認
echo "=== クリア後のペイン内容 ==="
for pane_id in $(tmux list-panes -a -F "#{pane_id}"); do
  echo "--- Pane $pane_id ---"
  tmux capture-pane -t "$pane_id" -p 2>/dev/null || echo "Failed to capture $pane_id"
  echo ""
done

# ペインタイトルの変化を確認
echo "=== クリア後のペインタイトル ==="
tmux list-panes -a -F "#{pane_id}: #{pane_title}"
```

**成功の定義:**
- [ ] worker pane（%0以外）の内容がクリアされる
- [ ] main pane（%0）の内容が保護される（クリアされない）
- [ ] 全対象ペインに`clear`コマンドが送信される
- [ ] ペインタイトルが適切に更新される
- [ ] エラーなく安全に実行される

**4.2.2 詳細クリア検証テスト**

**準備:**
```bash
# より詳細なテスト用コンテンツを各ペインに配置
echo "=== 詳細クリア検証用のコンテンツ配置 ==="
for pane_id in $(tmux list-panes -a -F "#{pane_id}"); do
  echo "Setting up pane $pane_id"
  # 複数行のテストコンテンツを送信
  tmux send-keys -t "$pane_id" "echo '=== Pane $pane_id Test Content ==='" C-m 2>/dev/null || true
  tmux send-keys -t "$pane_id" "echo 'Current time: $(date)'" C-m 2>/dev/null || true
  tmux send-keys -t "$pane_id" "echo 'Working directory: $(pwd)'" C-m 2>/dev/null || true
  tmux send-keys -t "$pane_id" "echo 'Line count test:'" C-m 2>/dev/null || true
  tmux send-keys -t "$pane_id" "for i in {1..5}; do echo \"Line \$i\"; done" C-m 2>/dev/null || true
  sleep 0.5
done

# 配置完了後の状態を記録
echo "=== 配置完了後の全ペイン状態 ==="
for pane_id in $(tmux list-panes -a -F "#{pane_id}"); do
  echo "--- Pane $pane_id (lines: $(tmux capture-pane -t "$pane_id" -p 2>/dev/null | wc -l || echo 0)) ---"
  tmux capture-pane -t "$pane_id" -p 2>/dev/null | tail -10 || echo "Failed to capture $pane_id"
  echo ""
done
```

**実行コマンド:**
```bash
# アプリケーションのクリア機能を実行
echo "=== tmux-monitor クリア機能実行 ==="
timeout 45s deno task start --clear --onetime
```

**詳細検証:**
```bash
# 実行後の全ペイン状態を詳細確認
echo "=== クリア実行後の全ペイン詳細状態 ==="
for pane_id in $(tmux list-panes -a -F "#{pane_id}"); do
  echo "----------------------------------------"
  echo "Pane ID: $pane_id"
  echo "Title: $(tmux display-message -t "$pane_id" -p '#{pane_title}' 2>/dev/null || echo 'N/A')"
  echo "Active: $(tmux display-message -t "$pane_id" -p '#{pane_active}' 2>/dev/null || echo 'N/A')"
  echo "Command: $(tmux display-message -t "$pane_id" -p '#{pane_current_command}' 2>/dev/null || echo 'N/A')"
  
  # ペイン内容のライン数
  line_count=$(tmux capture-pane -t "$pane_id" -p 2>/dev/null | wc -l || echo 0)
  echo "Line count: $line_count"
  
  # 最後の10行を表示
  echo "Last 10 lines:"
  tmux capture-pane -t "$pane_id" -p 2>/dev/null | tail -10 || echo "Failed to capture $pane_id"
  
  # 空行チェック（クリアされたかの判定）
  non_empty_lines=$(tmux capture-pane -t "$pane_id" -p 2>/dev/null | grep -v '^[[:space:]]*$' | wc -l || echo 0)
  echo "Non-empty lines: $non_empty_lines"
  
  if [ "$pane_id" = "%0" ]; then
    echo "🔍 Main pane - should NOT be cleared"
  else
    echo "🧹 Worker pane - should be cleared"
  fi
  echo ""
done

# クリア効果の統計
echo "=== クリア効果統計 ==="
main_pane_lines=$(tmux capture-pane -t "%0" -p 2>/dev/null | grep -v '^[[:space:]]*$' | wc -l || echo 0)
echo "Main pane (%0) non-empty lines: $main_pane_lines"

worker_pane_count=0
cleared_worker_count=0
for pane_id in $(tmux list-panes -a -F "#{pane_id}" | grep -v "%0"); do
  worker_pane_count=$((worker_pane_count + 1))
  non_empty_lines=$(tmux capture-pane -t "$pane_id" -p 2>/dev/null | grep -v '^[[:space:]]*$' | wc -l || echo 0)
  if [ "$non_empty_lines" -lt 3 ]; then  # クリアされたと判定する基準
    cleared_worker_count=$((cleared_worker_count + 1))
  fi
  echo "Worker pane $pane_id: $non_empty_lines non-empty lines"
done

echo "Worker panes total: $worker_pane_count"
echo "Cleared worker panes: $cleared_worker_count"
echo "Clear success rate: $(echo "scale=2; $cleared_worker_count * 100 / $worker_pane_count" | bc -l 2>/dev/null || echo "N/A")%"
```

**4.2.3 クリア処理の詳細ログ確認**

**実行コマンド:**
```bash
# ログレベルを上げてクリア処理の詳細を確認
echo "=== 詳細ログでのクリア処理確認 ==="
timeout 45s deno task start --clear --onetime 2>&1 | tee clear_process.log

# ログからクリア関連の処理を抽出
echo "=== クリア処理関連ログ ==="
grep -i "clear\|pane\|send" clear_process.log || echo "No clear-related logs found"

# 各ペインへの処理確認
echo "=== 各ペインへの処理確認 ==="
for pane_id in $(tmux list-panes -a -F "#{pane_id}"); do
  echo "Pane $pane_id processing:"
  grep "$pane_id" clear_process.log || echo "No logs for $pane_id"
done
```

**成功の定義（詳細版）:**
- [ ] アプリケーションが全worker paneを正しく識別する
- [ ] 各worker paneに`clear`コマンドが送信される
- [ ] main pane（%0）には`clear`コマンドが送信されない
- [ ] worker paneの画面内容が実際にクリアされる（非空行数が大幅減少）
- [ ] main paneの内容が保護される（内容が維持される）
- [ ] ペインタイトルが適切に更新される
- [ ] 処理中にエラーが発生しない
- [ ] 全ての対象ペインに対して処理が完了する

**4.2.4 エラーケース対応テスト**

**準備:**
```bash
# エラーケース用のテスト環境準備
echo "=== エラーケース準備 ==="

# 一部のペインを意図的に削除してエラーケースを作成
DELETED_PANE=""
for pane_id in $(tmux list-panes -a -F "#{pane_id}" | tail -1); do
  if [ "$pane_id" != "%0" ]; then
    echo "Deleting pane $pane_id for error case testing"
    tmux kill-pane -t "$pane_id" 2>/dev/null && DELETED_PANE="$pane_id" || echo "Failed to delete $pane_id"
    break
  fi
done

echo "Deleted pane: $DELETED_PANE"
```

**実行コマンド:**
```bash
# 削除されたペインが存在する状態でクリア実行
echo "=== エラーケース実行 ==="
timeout 45s deno task start --clear --onetime 2>&1 | tee error_case.log
```

**検証:**
```bash
# エラーハンドリングの確認
echo "=== エラーハンドリング確認 ==="
grep -i "error\|fail\|exception" error_case.log || echo "No errors found"

# 残存ペインの状態確認
echo "=== 残存ペイン状態確認 ==="
for pane_id in $(tmux list-panes -a -F "#{pane_id}"); do
  echo "Pane $pane_id: $(tmux capture-pane -t "$pane_id" -p 2>/dev/null | grep -v '^[[:space:]]*$' | wc -l || echo 0) non-empty lines"
done
```

**成功の定義（エラーケース）:**
- [ ] 削除されたペインでエラーが発生してもアプリケーションがクラッシュしない
- [ ] 残存する他のペインの処理が継続される
- [ ] 適切なエラーメッセージが出力される
- [ ] 処理完了まで到達する

#### 4.3 ペインタイトル管理テスト

**準備:**
```bash
# 既存のペインタイトルを確認
tmux list-panes -a -F "#{pane_id}: #{pane_title}"

# テスト用の複雑なタイトルを設定
tmux select-pane -t %0 -T "manager1: manager1: test title"
tmux select-pane -t %1 -T "[WORKING] worker2: worker2: another title"
tmux select-pane -t %2 -T "[DONE 07/14 22:08] complex: complex: task name"
```

**4.3.1 タイトルクリーニング機能テスト**

**実行コマンド:**
```bash
timeout 45s deno task start --onetime
```

**成功の定義:**
- [ ] 重複したロール名が正しく削除される（"manager1: manager1:" → "manager1:"）
- [ ] 既存のステータスプレフィックスが削除される（"[WORKING]", "[DONE]"等）
- [ ] タイムスタンプ付きステータスが削除される（"[DONE 07/14 22:08]"）
- [ ] 複数のプレフィックスが一度に処理される
- [ ] クリーニング後のタイトルが適切に保持される

**検証ポイント:**
```
✅ 期待する処理例:
Before: "[WORKING] manager1: manager1: test title"
After:  "[IDLE] manager1: test title"

Before: "worker2: worker2: worker2: another title"  
After:  "[WORKING] worker2: another title"

Before: "[DONE 07/14 22:08] complex: complex: task name"
After:  "[IDLE] complex: task name"
```

**4.3.2 ステータス更新の正確性テスト**

**実行コマンド:**
```bash
# 継続監視でステータス変化を確認
timeout 90s deno task start
```

**成功の定義:**
- [ ] IDLE → WORKING の変化が正しく反映される
- [ ] WORKING → IDLE の変化が正しく反映される
- [ ] ステータス変更時にタイトルの基本部分が保持される
- [ ] 複数ペインの同時更新が正常に動作する
- [ ] ペイン名がある場合の形式が正しい（"[STATUS] name: title"）

**検証ポイント:**
```
✅ 期待するステータス変更:
Initial: "[IDLE] manager1: test title"
Working: "[WORKING] manager1: test title"
Back:    "[IDLE] manager1: test title"

✅ ペイン名付きの場合:
"[WORKING] pane-name: original title"
```

**4.3.3 タイトル復元テスト**

**実行コマンド:**
```bash
# 元のタイトルを記録してから実行
ORIGINAL_TITLES=$(tmux list-panes -a -F "#{pane_id}:#{pane_title}")
echo "Original titles: $ORIGINAL_TITLES"

timeout 30s deno task start --onetime

# 実行後のタイトルを確認
echo "After monitoring:"
tmux list-panes -a -F "#{pane_id}: #{pane_title}"
```

**成功の定義:**
- [ ] 元のタイトル情報が適切に保存される
- [ ] 監視終了後にタイトルが正しく復元される（オプション）
- [ ] 複数のステータス変更を経ても基本タイトルが維持される
- [ ] ペインが削除された場合のエラーハンドリングが適切

**4.3.4 エッジケースのタイトル処理テスト**

**準備:**
```bash
# エッジケース用のタイトルを設定
tmux select-pane -t %0 -T ""  # 空タイトル
tmux select-pane -t %1 -T "   "  # 空白のみ
tmux select-pane -t %2 -T "[UNKNOWN] [WORKING] nested: nested: title"  # 多重プレフィックス
tmux select-pane -t %3 -T "役割1: 役割1: 日本語タイトル"  # 日本語
```

**実行コマンド:**
```bash
timeout 45s deno task start --onetime
```

**成功の定義:**
- [ ] 空タイトルが "tmux" フォールバックで処理される
- [ ] 空白のみのタイトルが適切に処理される
- [ ] 多重プレフィックスが完全に削除される
- [ ] 日本語文字を含むタイトルが正しく処理される
- [ ] 特殊文字を含むタイトルが破損しない

**検証ポイント:**
```
✅ エッジケースの処理例:
Empty: "" → "[IDLE] tmux"
Whitespace: "   " → "[IDLE] tmux"
Multi-prefix: "[UNKNOWN] [WORKING] nested: nested: title" → "[IDLE] nested: title"
Japanese: "役割1: 役割1: 日本語タイトル" → "[IDLE] 役割1: 日本語タイトル"
```

**4.3.5 ペイン削除時のタイトル処理テスト**

**実行コマンド:**
```bash
# 監視開始
timeout 60s deno task start &
MONITOR_PID=$!

sleep 10
# 監視中にペインを削除
tmux kill-pane -t %2 2>/dev/null || true

sleep 20
# モニターを停止
kill $MONITOR_PID 2>/dev/null || true
wait
```

**成功の定義:**
- [ ] 削除されたペインでエラーが発生しない
- [ ] 他のペインの監視が継続される
- [ ] 存在チェックが正常に動作する
- [ ] ログに適切な警告メッセージが出力される
- [ ] アプリケーションがクラッシュしない

### 5. エラーハンドリングテスト

#### 5.1 不正なオプション

**実行コマンド:**
```bash
timeout 10s deno task start --invalid-option 2>&1 | head -20
```

**成功の定義:**
- [ ] 適切なエラーメッセージが表示される
- [ ] ヘルプ情報が表示される
- [ ] 異常終了する（終了コード: 1）

#### 5.2 存在しない指示書ファイル

**実行コマンド:**
```bash
timeout 10s deno task start --instruction=/nonexistent/file.txt --onetime 2>&1
```

**成功の定義:**
- [ ] ファイル不存在エラーが適切に処理される
- [ ] 分かりやすいエラーメッセージが表示される
- [ ] アプリケーションがクラッシュしない

### 6. パフォーマンステスト

#### 6.1 多数ペイン環境でのテスト

**実行コマンド:**
```bash
# 複数ペインを作成してテスト
timeout 45s deno task start --onetime
```

**成功の定義:**
- [ ] 10個以上のペインを正常に処理する
- [ ] レスポンス時間が許容範囲内（<5秒）
- [ ] メモリ使用量が適切
- [ ] すべてのペインが漏れなく監視される

#### 6.2 長時間実行テスト

**実行コマンド:**
```bash
timeout 300s deno task start
```

**成功の定義:**
- [ ] 5分間の継続実行が安定している
- [ ] メモリリークが発生しない
- [ ] CPU使用率が適切
- [ ] 定期的な統計情報が出力される

## 🧪 CI/CDテスト

### 7.1 自動テスト実行

**実行コマンド:**
```bash
timeout 120s deno task test
```

**成功の定義:**
- [ ] 全247テストが成功する
- [ ] テスト実行時間が許容範囲内
- [ ] カバレッジが維持される

### 7.2 コード品質チェック

**実行コマンド:**
```bash
timeout 60s deno task ci:dirty
```

**成功の定義:**
- [ ] 型チェックが成功する
- [ ] JSR互換性チェックが成功する
- [ ] リンティングが成功する
- [ ] フォーマットチェックが成功する
- [ ] 全5段階のCIステージが成功する

## 📊 総合評価基準

### ✅ 成功基準（PASS）

以下の条件をすべて満たす場合、実装は成功とみなす：

1. **機能完全性**
   - [ ] 全基本機能が正常動作する
   - [ ] オプションの組み合わせが正しく処理される
   - [ ] エラーハンドリングが適切に動作する
   - [ ] ペインタイトル管理が正確に動作する

2. **アーキテクチャ準拠**
   - [ ] DDDの集約ルート（Pane）が正常に機能する
   - [ ] イベント駆動アーキテクチャが実装されている
   - [ ] ドメイン境界が適切に維持されている

3. **品質保証**
   - [ ] 全自動テストが成功する
   - [ ] CI/CDパイプラインが成功する
   - [ ] コード品質基準を満たす

4. **パフォーマンス**
   - [ ] 応答時間が許容範囲内
   - [ ] メモリ使用量が適切
   - [ ] 長時間実行が安定している

5. **ユーザビリティ**
   - [ ] 直感的なコマンドライン操作
   - [ ] 分かりやすいログ出力
   - [ ] 適切なエラーメッセージ

6. **タイトル管理の信頼性**
   - [ ] 複雑なタイトルパターンの正確な処理
   - [ ] ステータス変更時のタイトル整合性
   - [ ] エッジケース（空タイトル、多言語等）の適切な処理
   - [ ] ペイン削除時の安全な処理

### 🔧 総合評価実行

**最終評価コマンド:**
```bash
# 全テストケースの自動実行スクリプト例
cat > test_all.sh << 'EOF'
#!/bin/bash
set -e

echo "🚀 tmux-monitor 総合テスト開始"
echo "================================"

# 基本機能テスト
echo "📋 1. 基本機能テスト"
timeout 30s deno task start --onetime
echo "✅ 単発監視テスト完了"

# タイトル管理テスト
echo "📋 2. タイトル管理テスト"
echo "現在のペインタイトル:"
tmux list-panes -a -F "#{pane_id}: #{pane_title}"

# 複雑なタイトルを設定してテスト
tmux select-pane -t %0 -T "manager1: manager1: test title" 2>/dev/null || true
tmux select-pane -t %1 -T "[WORKING] worker2: worker2: another title" 2>/dev/null || true

timeout 45s deno task start --onetime
echo "タイトル処理後:"
tmux list-panes -a -F "#{pane_id}: #{pane_title}"
echo "✅ タイトル管理テスト完了"

# CI/CDテスト
echo "📋 3. CI/CDテスト"
timeout 120s deno task ci:dirty
echo "✅ CI/CDテスト完了"

# 自動テスト
echo "📋 4. 自動テスト実行"
timeout 120s deno task test
echo "✅ 自動テスト完了"

echo "🎉 全テスト完了！"
EOF

chmod +x test_all.sh
timeout 300s ./test_all.sh
```

### 📈 評価レポート作成

テスト完了後、以下の形式で評価レポートを作成してください：

```markdown
# tmux-monitor テスト評価レポート

## 実行日時
- 実行日: $(date)
- 実行環境: $(uname -a)
- Deno版本: $(deno --version)

## テスト結果サマリー
- 実行テストケース数: X/Y
- 成功率: X%
- 所要時間: X分

## 各テストケース結果
1. 基本機能テスト: ✅/❌
2. 時間指定実行テスト: ✅/❌
3. 指示書実行テスト: ✅/❌
4. ペイン管理テスト: ✅/❌
   4.1 ペイン一覧表示: ✅/❌
   4.2 ペインクリア機能: ✅/❌
   4.3 ペインタイトル管理: ✅/❌
     4.3.1 タイトルクリーニング機能: ✅/❌
     4.3.2 ステータス更新の正確性: ✅/❌
     4.3.3 タイトル復元: ✅/❌
     4.3.4 エッジケースの処理: ✅/❌
     4.3.5 ペイン削除時の処理: ✅/❌
5. エラーハンドリングテスト: ✅/❌
6. パフォーマンステスト: ✅/❌
7. CI/CDテスト: ✅/❌

## 問題と改善点
- 発見された問題: [記載]
- 改善提案: [記載]

## 総合評価
- 全体評価: 合格/不合格
- 推奨アクション: [記載]
```

## 🎯 実行指示

このテストガイドを使用して以下を実行してください：

1. **段階的テスト実行**: 各テストケースを順番に実行し、結果を記録
2. **問題の特定**: 失敗したテストケースの原因を分析
3. **パフォーマンス測定**: 実行時間とリソース使用量を監視
4. **総合評価**: 全テスト完了後に総合的な品質評価を実施
5. **改善提案**: 発見された問題に対する具体的な改善案を提示

**重要**: タイムアウトを適切に設定し、無限ループや異常な長時間実行を防止してください。
