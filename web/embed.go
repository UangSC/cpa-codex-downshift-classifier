package web

import (
	"embed"
	"io/fs"
)

//go:embed dist
var content embed.FS

func Assets() fs.FS { assets, _ := fs.Sub(content, "dist"); return assets }
