for /f "tokens=2 delims==" %%i in ('wmic os get localdatetime /value') do set datetime=%%i
set date=%datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2%
hexo new %date%