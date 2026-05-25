# EEP Realworld Simulation — split-screen recording
# Runs Scenario A (current web HTML scraping) and Scenario B (EEP) IN PARALLEL
# in two side-by-side terminal panes. The contrast in completion time is the point.
#
# Run with: vhs demo.tape (requires brew install vhs)

Output realworld-demo.mp4

Set FontSize 11
Set Width 1800
Set Height 950
Set Padding 18
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms

Type "DEMO_SPLIT_SCREEN=1 npm run demo:only"
Sleep 400ms
Enter
Sleep 45s
