#!/bin/bash
set -euo pipefail

LOG_FILE="${1:-./codepolicy.log}"

if [[ ! -f "$LOG_FILE" ]]; then
    echo "Error: $LOG_FILE not found" >&2
    exit 1
fi

FAIL_COUNT=$(grep -c "FAIL" "$LOG_FILE" || echo 0)
FILE_COUNT=$(grep "FAIL" "$LOG_FILE" | grep -oP 'packages/[^:]+' | sort -u | wc -l)

if [[ "$FAIL_COUNT" -eq 0 ]]; then
    echo "No FAIL entries found in $LOG_FILE"
    exit 0
fi

echo "Found $FAIL_COUNT FAIL(s) in $FILE_COUNT file(s)"

# Create parent issue
PARENT_BODY="## 概要

codepolicyによる静的解析で${FAIL_COUNT}件の指摘が検出された。
${FILE_COUNT}ファイルに対してエラーが発生している。

## ルール別集計

| ルール | 説明 |
|--------|------|
| test-validity | テストの妥当性（必要十分性・変更耐性） |
| code-duplication | コード重複 |
| no-invalid-state-type | 不正な状態を許容する型設計 |
| no-implicit-fallback | 暗黙的なフォールバック |
| strict-function-boundary | 関数境界の厳密性 |

## 対応方針

- 各ファイルごとにsubissueを作成
- 妥当性は未検証（タスク実行時に個別確認）
- 修正が相互に影響する可能性があるため、ファイル単位でまとめる

## 詳細ログ

\`$LOG_FILE\` を参照"

PARENT_OUTPUT=$(bit issue create \
    --title "codepolicy: ${FAIL_COUNT}件の指摘対応" \
    --label "codepolicy" \
    --body "$PARENT_BODY")

PARENT_ID=$(echo "$PARENT_OUTPUT" | head -1 | awk '{print $2}')
echo "Created parent issue: $PARENT_ID"

# Create subissues per file
grep "FAIL" "$LOG_FILE" | grep -oP 'packages/[^:]+' | sort -u | while read -r filepath; do
    fail_count=$(grep "FAIL" "$LOG_FILE" | grep "$filepath:" | wc -l)

    details=$(grep "FAIL" "$LOG_FILE" | grep "$filepath:" | \
        sed 's/.*\[LintPipeline\] //' | \
        sed 's/ | Evaluating.*//' | \
        while read -r line; do
            rule=$(echo "$line" | grep -oP '\[[\w-]+\]' | head -1 | tr -d '[]')
            target=$(echo "$line" | sed 's/.*> //' | sed 's/ \[.*//' | sed "s|$filepath:||")
            score=$(echo "$line" | grep -oP 'score: \d+' | head -1 | sed 's/score: //')
            echo "- [$rule] \`$target\` (score: $score)"
        done)

    filename=$(basename "$filepath")
    title="[$filename] codepolicy ${fail_count}件"

    body="## 対象ファイル
\`$filepath\`

## 指摘内容 (${fail_count}件)
$details

## 注意
- 妥当性は未検証（実装時に確認すること）"

    bit issue create --title "$title" --label "codepolicy" --parent "$PARENT_ID" --body "$body" >/dev/null
    echo "  Created: $title"
done

echo ""
echo "Done! Parent issue: $PARENT_ID"
echo "View with: bit issue get $PARENT_ID"
