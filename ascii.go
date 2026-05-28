package main

import (
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
)

// rampDark is ordered from most ink (index 0) to least ink (last). A bright
// source pixel should pick a dense glyph, so we index it with (255-luminance).
const rampDark = "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. "

type asciiRun struct {
	T string `json:"t"`
	C string `json:"c,omitempty"`
}

func (s *Server) handleASCII(w http.ResponseWriter, r *http.Request) {
	section := r.URL.Query().Get("section")
	rel := r.URL.Query().Get("path")
	full, ok := s.resolve(section, rel)
	if !ok {
		http.Error(w, "bad path", http.StatusBadRequest)
		return
	}
	if classify(full) != "image" {
		http.Error(w, "not an image", http.StatusBadRequest)
		return
	}
	f, err := os.Open(full)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	defer f.Close()

	img, _, err := image.Decode(f)
	if err != nil {
		http.Error(w, "decode error: "+err.Error(), http.StatusUnprocessableEntity)
		return
	}

	cols := clampInt(atoiDefault(r.URL.Query().Get("width"), 100), 16, 260)
	mono := r.URL.Query().Get("mono") != ""

	cols, rows, lines := renderASCII(img, cols, !mono)
	writeJSON(w, map[string]any{
		"cols":  cols,
		"rows":  rows,
		"color": !mono,
		"lines": lines,
	})
}

// renderASCII downsamples img onto a character grid. When color is true each
// returned line is a slice of {text,color} runs; otherwise each line is a plain
// string (encoded as a single run with no color).
func renderASCII(img image.Image, cols int, color bool) (int, int, []any) {
	b := img.Bounds()
	iw, ih := b.Dx(), b.Dy()
	if iw == 0 || ih == 0 {
		return 0, 0, nil
	}
	// Characters are roughly twice as tall as wide, so halve the row count.
	rows := int(math.Round(float64(ih) / float64(iw) * float64(cols) * 0.5))
	if rows < 1 {
		rows = 1
	}

	lines := make([]any, 0, rows)
	for cy := 0; cy < rows; cy++ {
		y0 := b.Min.Y + cy*ih/rows
		y1 := b.Min.Y + (cy+1)*ih/rows
		if y1 <= y0 {
			y1 = y0 + 1
		}
		if color {
			lines = append(lines, buildColorRow(img, b, iw, cols, y0, y1))
		} else {
			lines = append(lines, buildMonoRow(img, b, iw, cols, y0, y1))
		}
	}
	return cols, rows, lines
}

func buildMonoRow(img image.Image, b image.Rectangle, iw, cols, y0, y1 int) string {
	var sb strings.Builder
	for cx := 0; cx < cols; cx++ {
		x0 := b.Min.X + cx*iw/cols
		x1 := b.Min.X + (cx+1)*iw/cols
		if x1 <= x0 {
			x1 = x0 + 1
		}
		_, _, _, lum := avgBlock(img, x0, y0, x1, y1)
		sb.WriteByte(rampChar(lum))
	}
	return sb.String()
}

func buildColorRow(img image.Image, b image.Rectangle, iw, cols, y0, y1 int) []asciiRun {
	runs := make([]asciiRun, 0, 16)
	var cur strings.Builder
	curColor := ""
	flush := func() {
		if cur.Len() > 0 {
			runs = append(runs, asciiRun{T: cur.String(), C: curColor})
			cur.Reset()
		}
	}
	for cx := 0; cx < cols; cx++ {
		x0 := b.Min.X + cx*iw/cols
		x1 := b.Min.X + (cx+1)*iw/cols
		if x1 <= x0 {
			x1 = x0 + 1
		}
		rr, gg, bb, lum := avgBlock(img, x0, y0, x1, y1)
		// Quantize colour so adjacent similar cells merge into one run.
		hex := fmt.Sprintf("#%02x%02x%02x", rr&0xF8, gg&0xF8, bb&0xF8)
		if hex != curColor {
			flush()
			curColor = hex
		}
		cur.WriteByte(rampChar(lum))
	}
	flush()
	return runs
}

// avgBlock returns the average R,G,B and luminance (0..255) of a source block.
func avgBlock(img image.Image, x0, y0, x1, y1 int) (uint8, uint8, uint8, int) {
	var sr, sg, sb, n uint64
	for y := y0; y < y1; y++ {
		for x := x0; x < x1; x++ {
			r, g, bl, _ := img.At(x, y).RGBA() // 16-bit channels
			sr += uint64(r >> 8)
			sg += uint64(g >> 8)
			sb += uint64(bl >> 8)
			n++
		}
	}
	if n == 0 {
		return 0, 0, 0, 0
	}
	r := uint8(sr / n)
	g := uint8(sg / n)
	b := uint8(sb / n)
	lum := int(0.299*float64(r) + 0.587*float64(g) + 0.114*float64(b))
	return r, g, b, lum
}

func rampChar(lum int) byte {
	idx := (255 - lum) * (len(rampDark) - 1) / 255
	if idx < 0 {
		idx = 0
	}
	if idx >= len(rampDark) {
		idx = len(rampDark) - 1
	}
	return rampDark[idx]
}

func atoiDefault(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
