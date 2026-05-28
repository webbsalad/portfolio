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

// The university-works folder is shown in the dock as `university-work`, but it
// tracks the GitHub repo named `3-course`. Around every sync we temporarily
// rename it back to `3-course` so git reuses the existing checkout instead of
// re-cloning everything, then rename it back to the display name afterwards.
const (
	syncRepoName    = "3-course"
	syncDisplayName = "university-work"
)

// startGitSync runs an initial sync on startup and then repeats every interval.
// It is a no-op if git is unavailable.
func startGitSync(dockDir string, interval time.Duration) {
	if _, err := exec.LookPath("git"); err != nil {
		log.Printf("git sync: git not found in PATH, skipping")
		return
	}
	syncOnce(dockDir)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		syncOnce(dockDir)
	}
}

// syncOnce renames the display folder back to the repo name, pulls, and restores
// the display name. Renaming keeps the existing .git checkout so git only fetches
// new commits instead of cloning the whole repository again.
func syncOnce(dockDir string) {
	repoPath := filepath.Join(dockDir, syncRepoName)
	dispPath := filepath.Join(dockDir, syncDisplayName)

	if isGitCheckout(dispPath) {
		if err := os.Rename(dispPath, repoPath); err != nil {
			log.Printf("git sync: rename %s -> %s failed: %v", syncDisplayName, syncRepoName, err)
			return
		}
	}
	// Always restore the display name, even if the pull fails or panics.
	defer func() {
		if _, err := os.Stat(repoPath); err == nil {
			if err := os.Rename(repoPath, dispPath); err != nil {
				log.Printf("git sync: rename %s -> %s failed: %v", syncRepoName, syncDisplayName, err)
			}
		}
	}()

	if !isGitCheckout(repoPath) {
		log.Printf("git sync: %s is not a git checkout, skipping", repoPath)
		return
	}
	pull(repoPath)
}

func isGitCheckout(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, ".git"))
	return err == nil
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
