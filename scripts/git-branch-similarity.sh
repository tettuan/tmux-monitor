#!/bin/bash

# Git branch similarity checker and auto-creation script
# Usage: ./git-branch-similarity.sh "current_branch" "proposed_branch"

set -e

CURRENT_BRANCH_INPUT="$1"
PROPOSED_BRANCH_INPUT="$2"
SIMILARITY_THRESHOLD=0.7

if [ -z "$CURRENT_BRANCH_INPUT" ] || [ -z "$PROPOSED_BRANCH_INPUT" ]; then
    echo "Usage: $0 \"current_branch\" \"proposed_branch\""
    echo "Example: $0 \"feature/user-management\" \"fix/batch-processing-bug\""
    echo "Example: $0 \"develop\" \"feature/api-enhancement\""
    exit 1
fi

# Get current branch name (fallback to git if not provided as input)
if [ "$CURRENT_BRANCH_INPUT" = "auto" ]; then
    CURRENT_BRANCH=$(git branch --show-current)
else
    CURRENT_BRANCH="$CURRENT_BRANCH_INPUT"
fi

PROPOSED_BRANCH="$PROPOSED_BRANCH_INPUT"

# If current branch is main or develop, always create new branch
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "develop" ]; then
    # Check if proposed branch already exists
    if git show-ref --verify --quiet refs/heads/"$PROPOSED_BRANCH"; then
        echo "🔄 SWITCH_TO_EXISTING '$CURRENT_BRANCH' → '$PROPOSED_BRANCH' (main/develop)"
    else
        echo "✨ CREATE_NEW '$CURRENT_BRANCH' → '$PROPOSED_BRANCH' (main/develop)"
    fi
    exit 0
fi

# Calculate similarity between current branch and proposed branch
SIMILARITY=$(python3 -c "
import sys
import re
from difflib import SequenceMatcher

def levenshtein_distance(s1, s2):
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    
    if len(s2) == 0:
        return len(s1)
    
    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    
    return previous_row[-1]

def string_similarity(s1, s2):
    edit_distance = levenshtein_distance(s1, s2)
    max_len = max(len(s1), len(s2))
    return 1.0 - (edit_distance / max_len) if max_len > 0 else 1.0

def extract_keywords(branch_name):
    # Extract work type keywords from branch name
    keywords = set()
    work_types = ['feature', 'fix', 'bug', 'refactor', 'docs', 'test', 'hotfix', 'improvement']
    
    for keyword in work_types:
        if keyword in branch_name.lower():
            keywords.add(keyword)
    
    return keywords

def extract_domain_words(branch_name):
    # Extract project-specific domain words from branch name
    domain_words = set()
    domains = ['api', 'db', 'database', 'batch', 'model', 'service', 'repository', 
              'migration', 'csv', 'import', 'export', 'config', 'test', 'integration',
              'user', 'auth', 'login', 'admin', 'dashboard', 'report', 'sync']
    
    for domain in domains:
        if domain in branch_name.lower():
            domain_words.add(domain)
    
    return domain_words

def prefix_similarity(branch1, branch2):
    # Check if both branches have the same prefix (feature/, fix/, etc.)
    prefix1 = branch1.split('/')[0] if '/' in branch1 else ''
    prefix2 = branch2.split('/')[0] if '/' in branch2 else ''
    
    if prefix1 and prefix2:
        return 1.0 if prefix1 == prefix2 else 0.0
    elif not prefix1 and not prefix2:
        return 0.5  # neutral
    else:
        return 0.0  # one has prefix, one doesn't

def semantic_similarity(branch1, branch2):
    keywords1 = extract_keywords(branch1)
    keywords2 = extract_keywords(branch2)
    
    if not keywords1 and not keywords2:
        return 0.5
    
    common = len(keywords1.intersection(keywords2))
    total = len(keywords1.union(keywords2))
    
    return common / total if total > 0 else 0

def context_similarity(branch1, branch2):
    domain_words1 = extract_domain_words(branch1)
    domain_words2 = extract_domain_words(branch2)
    
    if not domain_words1 and not domain_words2:
        return 0.5
    
    common = len(domain_words1.intersection(domain_words2))
    total = len(domain_words1.union(domain_words2))
    
    return common / total if total > 0 else 0

def calculate_branch_similarity(current_branch, proposed_branch):
    # Weights for different similarity metrics
    w1, w2, w3, w4 = 0.3, 0.3, 0.2, 0.2  # string, semantic, context, prefix
    
    str_sim = string_similarity(current_branch, proposed_branch)
    sem_sim = semantic_similarity(current_branch, proposed_branch)
    ctx_sim = context_similarity(current_branch, proposed_branch)
    pfx_sim = prefix_similarity(current_branch, proposed_branch)
    
    total_similarity = w1 * str_sim + w2 * sem_sim + w3 * ctx_sim + w4 * pfx_sim
    
    return total_similarity, {
        'string': str_sim,
        'semantic': sem_sim, 
        'context': ctx_sim,
        'prefix': pfx_sim
    }

# Main execution
current_branch = '$CURRENT_BRANCH'
proposed_branch = '$PROPOSED_BRANCH'

similarity, details = calculate_branch_similarity(current_branch, proposed_branch)

print(f'{similarity:.3f}|{details[\"string\"]:.3f}|{details[\"semantic\"]:.3f}|{details[\"context\"]:.3f}|{details[\"prefix\"]:.3f}')
")

# Parse Python output
IFS='|' read -r SIMILARITY_SCORE STRING_SIM SEMANTIC_SIM CONTEXT_SIM PREFIX_SIM <<< "$SIMILARITY"

# Compare similarity with threshold
SHOULD_CREATE_NEW=$(python3 -c "print('yes' if float('$SIMILARITY_SCORE') < $SIMILARITY_THRESHOLD else 'no')")

if [ "$SHOULD_CREATE_NEW" = "yes" ]; then
    echo "⚡ CREATE_NEW ($SIMILARITY_SCORE < $SIMILARITY_THRESHOLD) '$CURRENT_BRANCH' → '$PROPOSED_BRANCH'"
    
    # Check if proposed branch already exists
    if git show-ref --verify --quiet refs/heads/"$PROPOSED_BRANCH" 2>/dev/null; then
        echo "🔄 SWITCH_TO_EXISTING (branch exists)"
    else
        echo "✨ CREATE_NEW (new branch)"
    fi
else
    echo "⏳ STAY '$CURRENT_BRANCH' ($SIMILARITY_SCORE ≥ $SIMILARITY_THRESHOLD)"
fi

# ==============================================================================
# ALGORITHM DOCUMENTATION
# ==============================================================================
#
# This script implements a 4-factor composite scoring system for git branch 
# similarity analysis to determine whether to create a new branch or continue
# work on the current branch.
#
# SIMILARITY CALCULATION:
# similarity_score = 0.3 × string_similarity + 0.3 × semantic_similarity + 0.2 × context_similarity + 0.2 × prefix_similarity
#
# FACTORS EXPLAINED:
#
# 1. String Similarity (string_similarity) - Weight: 0.3
#    - Uses Levenshtein distance (edit distance) algorithm
#    - Formula: 1.0 - (edit_distance / max(length1, length2))
#    - Measures character-level similarity between branch names
#
# 2. Semantic Similarity (semantic_similarity) - Weight: 0.3
#    - Analyzes work type keywords in branch names
#    - Keywords: 'feature', 'fix', 'bug', 'refactor', 'docs', 'test', 'hotfix', 'improvement'
#    - Formula: common_keywords / total_unique_keywords
#    - Determines if branches represent similar types of work
#
# 3. Context Similarity (context_similarity) - Weight: 0.2
#    - Examines project-specific domain vocabulary
#    - Domains: 'api', 'db', 'database', 'batch', 'model', 'service', 'repository',
#              'migration', 'csv', 'import', 'export', 'config', 'test', 'integration',
#              'user', 'auth', 'login', 'admin', 'dashboard', 'report', 'sync'
#    - Formula: common_domains / total_unique_domains
#    - Identifies if branches work on related system components
#
# 4. Prefix Similarity (prefix_similarity) - Weight: 0.2
#    - Compares branch type prefixes (feature/, fix/, docs/, etc.)
#    - Returns 1.0 for identical prefixes, 0.0 for different prefixes
#    - Returns 0.5 if neither branch has a prefix (neutral case)
#    - Ensures conventional branch naming consistency
#
# DECISION LOGIC:
# - Threshold: 0.7
# - similarity_score < 0.7 → CREATE_NEW_BRANCH (branches are sufficiently different)
# - similarity_score >= 0.7 → CONTINUE_CURRENT_BRANCH (branches are similar enough)
# - Special case: main/develop branches always result in CREATE_NEW_BRANCH
#
# BRANCH EXISTENCE HANDLING:
# - If recommended branch already exists: SWITCH_TO_EXISTING
# - If recommended branch doesn't exist: CREATE_NEW
#
# This algorithm balances preventing unnecessary branch proliferation while
# ensuring semantically different work gets proper branch separation.
#
