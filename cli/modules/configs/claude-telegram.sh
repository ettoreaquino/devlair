#!/bin/bash
exec claude --channels plugin:telegram@claude-plugins-official "$@"
