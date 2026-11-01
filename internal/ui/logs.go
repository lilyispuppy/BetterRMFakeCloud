package ui

import (
	"net/http"
	"strconv"

	"github.com/ddvk/rmfakecloud/internal/logbuf"
	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

const (
	defaultLogLimit = 500
	maxLogLimit     = 2000
)

type logsResponse struct {
	Entries []logbuf.Entry `json:"entries"`
	// Last is the cursor to send back as `since` to receive only newer entries
	Last uint64 `json:"last"`
}

// getLogs returns recent server log lines. Query: since, level, q, limit.
func (app *ReactAppWrapper) getLogs(c *gin.Context) {
	q := logbuf.Query{
		Level:    logrus.TraceLevel,
		Contains: c.Query("q"),
		Limit:    defaultLogLimit,
	}

	if s := c.Query("since"); s != "" {
		since, err := strconv.ParseUint(s, 10, 64)
		if err != nil {
			badReq(c, "invalid since")
			return
		}
		q.Since = since
	}

	if l := c.Query("level"); l != "" {
		level, err := logrus.ParseLevel(l)
		if err != nil {
			badReq(c, "invalid level")
			return
		}
		q.Level = level
	}

	if l := c.Query("limit"); l != "" {
		limit, err := strconv.Atoi(l)
		if err != nil || limit < 0 {
			badReq(c, "invalid limit")
			return
		}
		if limit > 0 {
			q.Limit = min(limit, maxLogLimit)
		}
	}

	entries := app.logs.Entries(q)
	last := q.Since
	if n := len(entries); n > 0 {
		last = entries[n-1].Seq
	}
	c.JSON(http.StatusOK, logsResponse{Entries: entries, Last: last})
}
