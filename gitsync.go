package main

import (
	"context"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// startGitSync pulls repoDir from its origin on startup and then every
// interval. It is a no-op if the folder is not a git checkout or git is
// unavailable.
func startGitSync(repoDir string, interval time.Duration) {
	if _, err := os.Stat(filepath.Join(repoDir, ".git")); err != nil {
		log.Printf("git sync: %s is not a git checkout, skipping", repoDir)
		return
	}
	if _, err := exec.LookPath("git"); err != nil {
		log.Printf("git sync: git not found in PATH, skipping")
		return
	}
	pull(repoDir)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		pull(repoDir)
	}
}

func pull(repoDir string) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "-C", repoDir, "pull", "--ff-only")
	out, err := cmd.CombinedOutput()
	msg := strings.TrimSpace(string(out))
	if err != nil {
		log.Printf("git sync: pull failed: %v: %s", err, msg)
		return
	}
	log.Printf("git sync: %s", msg)
}
