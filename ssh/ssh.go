package ssh

import (
	"net"
	"os"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
)

type Client struct {
	addr   string
	config *ssh.ClientConfig
}

func NewClient(username string, addr string) *Client {
	return &Client{
		addr: addr,
		config: &ssh.ClientConfig{
			User: username,
			Auth: []ssh.AuthMethod{
				sshAgent(),
			},
			HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		},
	}
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

func sshAgent() ssh.AuthMethod {
	if sshAgent, err := net.Dial("unix", os.Getenv("SSH_AUTH_SOCK")); err == nil {
		return ssh.PublicKeysCallback(agent.NewClient(sshAgent).Signers)
	}
	return nil
}
