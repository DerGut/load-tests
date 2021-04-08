package ssh

import (
	"fmt"
	"net"
	"os"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
)

type Client struct {
	addr   string
	config *ssh.ClientConfig
}

func NewClient(username string, addr string) (*Client, error) {
	auth, err := sshAgent()
	if err != nil {
		return nil, err
	}
	return &Client{
		addr: addr,
		config: &ssh.ClientConfig{
			User: username,
			Auth: []ssh.AuthMethod{
				auth,
			},
			HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		},
	}, nil
}

type Session struct {
	*ssh.Session
}

func (c *Client) Session() (*Session, error) {
	conn, err := ssh.Dial("tcp", c.addr, c.config)
	if err != nil {
		return nil, err
	}

	session, err := conn.NewSession()
	if err != nil {
		return nil, err
	}
	return &Session{Session: session}, nil
}

func sshAgent() (ssh.AuthMethod, error) {
	sshAgent, err := net.Dial("unix", os.Getenv("SSH_AUTH_SOCK"))
	if err != nil {
		return nil, fmt.Errorf("failed to dial SSH_AUTH_SOCKET %w", err)
	}

	c := agent.NewClient(sshAgent)
	auth := ssh.PublicKeysCallback(c.Signers)

	return auth, nil
}
