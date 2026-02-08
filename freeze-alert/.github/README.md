# GitHub Repository Setup

## Pre-commit Hook (Optional)

To prevent accidentally committing secrets, you can install the pre-commit check:

```bash
# Make the script executable
chmod +x .github/pre-commit-check.sh

# Install as Git hook
ln -s ../../.github/pre-commit-check.sh .git/hooks/pre-commit
```

This will check staged files for potential secrets before each commit.

## Security Checklist Before Committing

- [ ] No `.dev.vars` file is staged
- [ ] No `.env` files are staged
- [ ] No hardcoded API keys or tokens in source code
- [ ] All secrets are in environment variables only
- [ ] `.gitignore` includes all sensitive file patterns

## If Secrets Are Accidentally Committed

1. **Immediately rotate** all exposed credentials
2. Remove from Git history: `git filter-branch` or BFG Repo-Cleaner
3. Force push (coordinate with team)
4. See `SECURITY.md` for detailed instructions

