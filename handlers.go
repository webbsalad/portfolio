package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Server serves the portfolio dock over HTTP.
type Server struct {
	dock string
}

var sections = map[string]bool{
	"about":           true,
	"university-work": true,
	// `3-course` stays valid because the synced checkout is briefly renamed to it
	// during a pull (see gitsync.go).
	"3-course": true,
	"projects": true,
}

// resolve maps a (section, relative path) pair to an absolute path inside the
// dock, rejecting anything that would escape the section directory.
func (s *Server) resolve(section, rel string) (string, bool) {
	if !sections[section] {
		return "", false
	}
	base := filepath.Join(s.dock, section)
	clean := filepath.Clean("/" + strings.ReplaceAll(rel, "\\", "/"))
	full := filepath.Join(base, clean)
	if full != base && !strings.HasPrefix(full, base+string(os.PathSeparator)) {
		return "", false
	}
	return full, true
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(v)
}

type entry struct {
	Name string `json:"name"`
	Dir  bool   `json:"dir"`
	Size int64  `json:"size"`
	Kind string `json:"kind"`
}

func (s *Server) handleTree(w http.ResponseWriter, r *http.Request) {
	section := r.URL.Query().Get("section")
	rel := r.URL.Query().Get("path")
	full, ok := s.resolve(section, rel)
	if !ok {
		http.Error(w, "bad path", http.StatusBadRequest)
		return
	}
	items, err := os.ReadDir(full)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	entries := make([]entry, 0, len(items))
	for _, it := range items {
		name := it.Name()
		if strings.HasPrefix(name, ".") { // hide .git, .idea, .DS_Store, ...
			continue
		}
		info, _ := it.Info()
		var size int64
		if info != nil {
			size = info.Size()
		}
		e := entry{Name: name, Dir: it.IsDir(), Size: size, Kind: "dir"}
		if !it.IsDir() {
			e.Kind = classify(name)
		}
		entries = append(entries, e)
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].Dir != entries[j].Dir {
			return entries[i].Dir
		}
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})
	writeJSON(w, map[string]any{"section": section, "path": rel, "entries": entries})
}

const maxTextBytes = 1 << 20 // 1 MiB

func (s *Server) handleFile(w http.ResponseWriter, r *http.Request) {
	section := r.URL.Query().Get("section")
	rel := r.URL.Query().Get("path")
	full, ok := s.resolve(section, rel)
	if !ok {
		http.Error(w, "bad path", http.StatusBadRequest)
		return
	}
	info, err := os.Stat(full)
	if err != nil || info.IsDir() {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	kind := classify(filepath.Base(full))
	resp := map[string]any{
		"name": filepath.Base(full),
		"kind": kind,
		"size": info.Size(),
	}
	if kind == "text" {
		data, err := os.ReadFile(full)
		if err != nil {
			http.Error(w, "read error", http.StatusInternalServerError)
			return
		}
		if len(data) > maxTextBytes {
			data = data[:maxTextBytes]
			resp["truncated"] = true
		}
		resp["content"] = string(data)
	}
	writeJSON(w, resp)
}

func (s *Server) handleOriginal(w http.ResponseWriter, r *http.Request) {
	section := r.URL.Query().Get("section")
	rel := r.URL.Query().Get("path")
	full, ok := s.resolve(section, rel)
	if !ok {
		http.Error(w, "bad path", http.StatusBadRequest)
		return
	}
	info, err := os.Stat(full)
	if err != nil || info.IsDir() {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if r.URL.Query().Get("download") != "" {
		w.Header().Set("Content-Disposition", "attachment; filename=\""+filepath.Base(full)+"\"")
	}
	http.ServeFile(w, r, full)
}

// classify returns a coarse file kind used by the frontend to decide how to
// open a file.
func classify(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp":
		return "image"
	case ".pdf":
		return "pdf"
	case ".txt", ".md", ".markdown", ".py", ".go", ".js", ".ts", ".jsx", ".tsx",
		".html", ".htm", ".css", ".scss", ".json", ".csv", ".tsv", ".sql", ".sh",
		".bash", ".zsh", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf", ".c",
		".h", ".cpp", ".hpp", ".java", ".rs", ".rb", ".php", ".pl", ".lua", ".r",
		".tex", ".xml", ".svg", ".env", ".gitignore", ".mod", ".sum", ".ipynb",
		".pyx", ".pbtxt", ".log", ".text", ".rtf", ".dockerfile":
		return "text"
	}
	if strings.EqualFold(name, "dockerfile") || strings.EqualFold(name, "makefile") || strings.EqualFold(name, "readme") {
		return "text"
	}
	return "binary"
}
