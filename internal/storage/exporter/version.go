package exporter

import "bytes"

// RmVersion is the format version of a .rm page file
type RmVersion int

// the known .rm versions
const (
	VersionUnknown RmVersion = iota
	VersionV3
	VersionV5
	VersionV6
)

const rmHeaderPrefix = "reMarkable .lines file, version="

// the header is the prefix, a digit, and spaces up to 43 bytes
const rmHeaderLen = 43

func (v RmVersion) String() string {
	switch v {
	case VersionV3:
		return "v3"
	case VersionV5:
		return "v5"
	case VersionV6:
		return "v6"
	}
	return "unknown"
}

// DetectVersion reads the format version from a .rm file's header
func DetectVersion(data []byte) RmVersion {
	if len(data) < rmHeaderLen || !bytes.HasPrefix(data, []byte(rmHeaderPrefix)) {
		return VersionUnknown
	}
	switch data[len(rmHeaderPrefix)] {
	case '3':
		return VersionV3
	case '5':
		return VersionV5
	case '6':
		return VersionV6
	}
	return VersionUnknown
}

// DetectArchiveVersion looks at the pages that have drawings. One v6 page
// makes the whole document v6, as documents can be mixed after an upgrade.
func DetectArchiveVersion(a *MyArchive) RmVersion {
	found := VersionUnknown
	for _, p := range a.PageData {
		v := DetectVersion(p.Raw)
		if v == VersionV6 {
			return VersionV6
		}
		if found == VersionUnknown {
			found = v
		}
	}
	return found
}
