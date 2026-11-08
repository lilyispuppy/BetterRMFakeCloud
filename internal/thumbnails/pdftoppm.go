package thumbnails

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// Width of the pictures, in pixels. Enough for a retina grid card.
const Width = 480

// Pdftoppm draws the first page with poppler's pdftoppm, which is installed in
// the Docker image. Without it there are no thumbnails and the web app shows
// icons instead.
func Pdftoppm(ctx context.Context, pdf []byte) ([]byte, error) {
	bin, err := exec.LookPath("pdftoppm")
	if err != nil {
		return nil, ErrUnavailable
	}
	dir, err := os.MkdirTemp("", "thumb-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)

	in := filepath.Join(dir, "in.pdf")
	if err := os.WriteFile(in, pdf, 0o600); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	var stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, bin, "-jpeg", "-jpegopt", "quality=82", "-f", "1", "-l", "1",
		"-scale-to-x", fmt.Sprint(Width), "-scale-to-y", "-1", "-singlefile", in, filepath.Join(dir, "out"))
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("pdftoppm: %w: %s", err, bytes.TrimSpace(stderr.Bytes()))
	}
	img, err := os.ReadFile(filepath.Join(dir, "out.jpg"))
	if err != nil {
		return nil, errors.New("pdftoppm drew nothing")
	}
	return img, nil
}
