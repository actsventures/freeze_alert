#!/bin/bash
# Pre-commit hook to check for accidentally committed secrets
# Install: ln -s ../../.github/pre-commit-check.sh .git/hooks/pre-commit

echo "Checking for secrets..."

# Patterns to detect secrets
PATTERNS=(
  "AC[a-zA-Z0-9]{32}"                    # Twilio Account SID
  "sk_(live|test)_[a-zA-Z0-9]{24,}"      # Stripe secret keys
  "whsec_[a-zA-Z0-9]{32,}"               # Stripe webhook secrets
  "price_[a-zA-Z0-9]{24,}"               # Stripe price IDs
  "[0-9a-f]{32,}"                        # Generic long hex strings (potential tokens)
)

FOUND_SECRET=false

for pattern in "${PATTERNS[@]}"; do
  # Check staged files only
  # Use -r flag to prevent xargs from running grep when no files are staged
  if git diff --cached --name-only | xargs -r grep -E "$pattern" 2>/dev/null; then
    echo "⚠️  WARNING: Potential secret detected matching pattern: $pattern"
    FOUND_SECRET=true
  fi
done

# Check for .dev.vars or other sensitive files
if git diff --cached --name-only | grep -E "\.(dev\.vars|env|secret|key)$"; then
  echo "❌ ERROR: Attempting to commit sensitive file!"
  echo "Files like .dev.vars, .env, *.secret, *.key should never be committed."
  exit 1
fi

if [ "$FOUND_SECRET" = true ]; then
  echo ""
  echo "⚠️  WARNING: Potential secrets detected in staged files."
  echo "Please review carefully before committing."
  echo "If these are false positives, you can commit with --no-verify"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo "✅ No secrets detected. Safe to commit."

