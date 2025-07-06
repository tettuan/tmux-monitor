#!/bin/bash

# =============================================================================
# Local CI Script - tmux-monitor
# =============================================================================
# This script runs the same checks as the GitHub Actions CI workflow locally
# Usage: ./scripts/local_ci.sh

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if Deno is installed
if ! command_exists deno; then
    print_error "Deno is not installed. Please install Deno first."
    echo "Visit: https://deno.land/manual/getting_started/installation"
    exit 1
fi

# Get Deno version
DENO_VERSION=$(deno --version | head -n1 | cut -d' ' -f2)
echo -e "${BLUE}Deno version:${NC} $DENO_VERSION"
echo ""

# =============================================================================
# Step 1: Check formatting
# =============================================================================
print_step "Checking code formatting..."
if deno fmt --check; then
    print_success "Code formatting is correct"
else
    print_error "Code formatting issues found"
    echo "Run 'deno fmt' to fix formatting issues"
    exit 1
fi
echo ""

# =============================================================================
# Step 2: Run linter
# =============================================================================
print_step "Running linter..."
if deno lint; then
    print_success "No linting issues found"
else
    print_error "Linting issues found"
    exit 1
fi
echo ""

# =============================================================================
# Step 3: Type check
# =============================================================================
print_step "Running type check..."
if deno check mod.ts main.ts; then
    print_success "Type checking passed"
else
    print_error "Type checking failed"
    exit 1
fi
echo ""

# =============================================================================
# Step 4: Run tests
# =============================================================================
print_step "Running tests..."
if deno test --allow-all --coverage=coverage/; then
    print_success "All tests passed"
else
    print_error "Some tests failed"
    exit 1
fi
echo ""

# =============================================================================
# Step 5: Generate coverage report
# =============================================================================
print_step "Generating coverage report..."
if deno coverage coverage/ --lcov --output=coverage/lcov.info; then
    print_success "Coverage report generated"
    
    # Try to show coverage summary if available
    if command_exists lcov; then
        echo ""
        print_step "Coverage summary:"
        lcov --summary coverage/lcov.info
    else
        print_warning "lcov not installed - install it to see coverage summary"
    fi
else
    print_warning "Failed to generate coverage report"
fi
echo ""

# =============================================================================
# Step 6: Validate publish configuration
# =============================================================================
print_step "Validating publish configuration..."

# Check required files
FILES_MISSING=false

if [ ! -f "main.ts" ]; then
    print_error "main.ts not found"
    FILES_MISSING=true
fi

if [ ! -f "mod.ts" ]; then
    print_error "mod.ts not found"
    FILES_MISSING=true
fi

if [ ! -d "src" ]; then
    print_error "src/ directory not found"
    FILES_MISSING=true
fi

if [ ! -f "LICENSE" ]; then
    print_error "LICENSE file not found"
    FILES_MISSING=true
fi

if [ "$FILES_MISSING" = true ]; then
    print_error "Required files for publishing are missing"
    exit 1
fi

print_success "All required files are present"

# Check for excluded files
print_step "Checking for files that should be excluded from publish..."

EXCLUDED_FOUND=false

# Check for test files in root
if ls *_test.ts 2>/dev/null >/dev/null; then
    print_warning "Test files found in root directory (will be excluded)"
    EXCLUDED_FOUND=true
fi

# Check for CLAUDE.md
if [ -f "CLAUDE.md" ]; then
    print_warning "CLAUDE.md found (will be excluded from publish)"
    EXCLUDED_FOUND=true
fi

# Check for scripts directory
if [ -d "scripts" ]; then
    print_warning "scripts/ directory found (will be excluded from publish)"
    EXCLUDED_FOUND=true
fi

# Check for hidden files (excluding .git)
if ls .??* 2>/dev/null | grep -v "^\.git$" >/dev/null; then
    print_warning "Hidden files found (will be excluded from publish)"
    EXCLUDED_FOUND=true
fi

if [ "$EXCLUDED_FOUND" = false ]; then
    print_success "No excluded files found"
fi

echo ""

# =============================================================================
# Step 7: Dry run publish
# =============================================================================
print_step "Performing dry run of publish..."
if deno publish --dry-run --allow-dirty; then
    print_success "Publish dry run completed successfully"
else
    print_error "Publish dry run failed"
    exit 1
fi
echo ""

# =============================================================================
# Summary
# =============================================================================
echo -e "${GREEN}🎉 All checks passed!${NC}"
echo ""
echo "Summary:"
echo "✅ Code formatting"
echo "✅ Linting"
echo "✅ Type checking"
echo "✅ Tests"
echo "✅ Coverage report"
echo "✅ Publish validation"
echo "✅ Publish dry run"
echo ""
echo -e "${BLUE}Your code is ready for CI/CD!${NC}"

# Optional: Show next steps
echo ""
echo "Next steps:"
echo "• Commit your changes: git add . && git commit -m 'Your message'"
echo "• Push to repository: git push origin main"
echo "• Create a release: git tag v1.0.0 && git push origin v1.0.0"
echo "• Or run manual publish: deno publish --allow-dirty"
