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
// tracks the GitHub repo named `3-course`. Around every sync we operate on the
// checkout under the repo name (cloning it the first time, fast-forwarding after
// that) and then rename it back to the display name. Renaming keeps the existing
// .git so we never re-download the whole repo.
const (
	syncRepoURL     = "https://github.com/webbsalad/3-course.git"
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

// syncOnce normalizes the checkout to the repo name, clones or pulls it, and then
// restores the display name. It never overwrites an existing target on rename, so
// it is safe to run repeatedly.
func syncOnce(dockDir string) {
	repoPath := filepath.Join(dockDir, syncRepoName)
	dispPath := filepath.Join(dockDir, syncDisplayName)

	// Operate under the repo name; restore the display name when done.
	if pathExists(dispPath) && !pathExists(repoPath) {
		if err := os.Rename(dispPath, repoPath); err != nil {
			log.Printf("git sync: rename %s -> %s failed: %v", syncDisplayName, syncRepoName, err)
			return
		}
	}
	defer func() {
		if pathExists(repoPath) && !pathExists(dispPath) {
			if err := os.Rename(repoPath, dispPath); err != nil {
				log.Printf("git sync: rename %s -> %s failed: %v", syncRepoName, syncDisplayName, err)
			}
		}
	}()

	if isGitCheckout(repoPath) {
		pull(repoPath)
		return
	}
	// First run (or a broken/empty checkout): start clean and clone fresh.
	if pathExists(repoPath) {
		if err := os.RemoveAll(repoPath); err != nil {
			log.Printf("git sync: clean %s failed: %v", repoPath, err)
			return
		}
	}
	cloneRepo(syncRepoURL, repoPath)
}

func pathExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func isGitCheckout(dir string) bool {
	return pathExists(filepath.Join(dir, ".git"))
}

func cloneRepo(url, dst string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	// Shallow clone: we only display the current files, so there is no need to
	// download the whole history (which can be large). Later pulls fast-forward.
	cmd := exec.CommandContext(ctx, "git", "clone", "--depth", "1", url, dst)
	out, err := cmd.CombinedOutput()
	msg := strings.TrimSpace(string(out))
	if err != nil {
		log.Printf("git sync: clone failed: %v: %s", err, msg)
		return
	}
	log.Printf("git sync: cloned %s into %s", url, filepath.Base(dst))
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
