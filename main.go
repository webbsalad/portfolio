package main

import (
	"embed"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"path/filepath"
	"time"
)

//go:embed web
var webFS embed.FS

func main() {
	addr := flag.String("addr", ":8080", "HTTP listen address")
	dock := flag.String("dock", "./dock", "path to the dock data directory")
	interval := flag.Duration("sync", 5*time.Minute, "git sync interval")
	flag.Parse()

	dockAbs, err := filepath.Abs(*dock)
	if err != nil {
		log.Fatalf("resolve dock dir: %v", err)
	}

	srv := &Server{dock: dockAbs}

	// Keep the university-works folder in sync with GitHub (see gitsync.go: the
	// 3-course repo is checked out and shown as university-work).
	go startGitSync(dockAbs, *interval)

	staticFS, err := fs.Sub(webFS, "web")
	if err != nil {
		log.Fatalf("sub web fs: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(staticFS)))
	mux.HandleFunc("/api/tree", srv.handleTree)
	mux.HandleFunc("/api/file", srv.handleFile)
	mux.HandleFunc("/api/ascii", srv.handleASCII)
	mux.HandleFunc("/api/original", srv.handleOriginal)

	log.Printf("ascii-port serving on %s  (dock=%s)", *addr, dockAbs)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatal(err)
	}
}
