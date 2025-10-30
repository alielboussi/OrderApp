Param()
Set-Location 'c:\Projects\Afterten Orders App'
$env:FILTER_BRANCH_SQUELCH_WARNING = '1'
$indexFilter = 'git rm --cached --ignore-unmatch -- "java_pid18552.hprof"'
git filter-branch --force --index-filter $indexFilter --prune-empty --tag-name-filter cat -- --all
