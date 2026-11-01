package ui

import (
	"net/http"
	"sort"

	"github.com/ddvk/rmfakecloud/internal/devices"
	"github.com/ddvk/rmfakecloud/internal/ui/viewmodel"
	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

// getDevices lists the caller's devices. With ?all=1 (admins only) it lists everyone's.
func (app *ReactAppWrapper) getDevices(c *gin.Context) {
	uid := userID(c)
	all := c.Query("all") == "1"
	if all && !IsAdmin(c) {
		c.AbortWithStatusJSON(http.StatusForbidden, viewmodel.NewErrorResponse("admins only"))
		return
	}

	out := make([]viewmodel.Device, 0)
	if app.devices == nil {
		c.JSON(http.StatusOK, out)
		return
	}

	// the network details are for developers only
	showDetails := false
	if user, err := app.userStorer.GetUser(uid); err == nil && user != nil {
		showDetails = user.Dev
	}

	byUser := map[string][]devices.Device{}
	if all {
		everyone, err := app.devices.ListAll()
		if err != nil {
			log.Error("[ui] listing all devices: ", err)
			c.AbortWithStatusJSON(http.StatusInternalServerError, viewmodel.NewErrorResponse("Unable to list devices."))
			return
		}
		byUser = everyone
	} else {
		mine, err := app.devices.List(uid)
		if err != nil {
			log.Error("[ui] listing devices: ", err)
			c.AbortWithStatusJSON(http.StatusInternalServerError, viewmodel.NewErrorResponse("Unable to list devices."))
			return
		}
		byUser[uid] = mine
	}

	owners := make([]string, 0, len(byUser))
	for owner := range byUser {
		owners = append(owners, owner)
	}
	sort.Strings(owners)

	for _, owner := range owners {
		online := map[string]bool{}
		if app.online != nil {
			for _, id := range app.online.ConnectedDevices(owner) {
				online[id] = true
			}
		}
		for _, d := range byUser[owner] {
			vm := viewmodel.Device{
				ID:          d.ID,
				Description: d.Description,
				FirstSeen:   d.FirstSeen,
				LastSeen:    d.LastSeen,
				SyncVersion: d.SyncVersion,
				Online:      online[d.ID],
			}
			if all {
				vm.UserID = owner
			}
			if showDetails {
				vm.LastIP = d.LastIP
				vm.UserAgent = d.UserAgent
			}
			out = append(out, vm)
		}
	}
	c.JSON(http.StatusOK, out)
}
