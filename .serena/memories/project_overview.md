# Project Overview

**Project Name**: @aidevtool/tmux-monitor  
**Version**: 1.3.15  
**License**: MIT  
**Repository**: https://github.com/tettuan/tmux-monitor.git

## Purpose
A comprehensive tmux monitoring tool designed for command-line usage with real-time monitoring and keyboard interrupt handling. The tool monitors tmux sessions and panes, providing live status updates, scheduled execution, and automatic pane management.

## Key Features
- Real-time monitoring of tmux sessions and panes
- 30-second interval content monitoring for WORKING/IDLE status determination
- Automatic pane title updates based on activity status
- Scheduled execution capabilities
- Instruction file support for sending startup commands
- Cross-platform support (macOS, Linux, Windows with WSL)
- Immediate cancellation with any key press or Ctrl+C
- Continuous monitoring mode (4 hours maximum with 30-second intervals)

## Primary Use Case
The tool is primarily used through CLI to monitor tmux sessions, automatically managing pane states and sending periodic ENTER keys to keep panes active. It's designed for developers who work with multiple tmux panes and need automated monitoring and management.