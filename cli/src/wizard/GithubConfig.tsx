/**
 * Wizard step — collect github_email (required) and github_name (optional)
 * for the github module so its SSH key generation does not silently skip.
 * Shown after Confirmation, before module execution, only when `github`
 * is in the selected set and no profile already supplied these values.
 */

import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { D_COMMENT, D_CYAN, D_GREEN, D_PINK, D_PURPLE, D_RED } from "../lib/theme.js";

export interface GithubConfigValues {
  email: string;
  name: string;
}

export interface GithubConfigProps {
  onConfirm: (values: GithubConfigValues) => void;
  onBack: () => void;
  onCancel: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Field = "email" | "name";

export function GithubConfig({ onConfirm, onBack, onCancel }: GithubConfigProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [focus, setFocus] = useState<Field>("email");
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (input === "q" && key.ctrl) {
      onCancel();
      return;
    }
    if (key.escape) {
      onBack();
      return;
    }
    if (key.tab || key.downArrow) {
      setFocus((f) => (f === "email" ? "name" : "email"));
      return;
    }
    if (key.upArrow) {
      setFocus((f) => (f === "email" ? "name" : "email"));
      return;
    }
    if (key.return) {
      if (!EMAIL_RE.test(email)) {
        setError("Enter a valid email address.");
        setFocus("email");
        return;
      }
      onConfirm({ email, name: name.trim() });
      return;
    }
    if (key.backspace || key.delete) {
      if (focus === "email") setEmail((v) => v.slice(0, -1));
      else setName((v) => v.slice(0, -1));
      setError(null);
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      if (focus === "email") setEmail((v) => v + input);
      else setName((v) => v + input);
      setError(null);
    }
  });

  const renderField = (field: Field, label: string, value: string, hint: string) => {
    const isFocused = focus === field;
    const caret = isFocused ? "│" : " ";
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color={isFocused ? D_PINK : D_COMMENT} bold>
            {"  "}
            {label}
          </Text>
          <Text color={D_COMMENT}> {hint}</Text>
        </Box>
        <Box>
          <Text color={D_COMMENT}>{"    "}</Text>
          <Text color={D_CYAN}>{value}</Text>
          <Text color={isFocused ? D_PINK : D_COMMENT}>{caret}</Text>
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={D_PINK} bold>
          {"  "}GitHub SSH key
        </Text>
        <Text color={D_COMMENT}>{"  needed to generate ~/.ssh/id_ed25519_github"}</Text>
      </Box>

      {renderField("email", "Email", email, "(required)")}
      {renderField("name", "Name", name, "(optional — git commit author)")}

      {error && (
        <Box marginBottom={1}>
          <Text color={D_RED}>
            {"  "}
            {error}
          </Text>
        </Box>
      )}

      <Box flexDirection="column">
        <Box>
          <Text>{"  "}</Text>
          <Text color={D_PURPLE}>Press </Text>
          <Text color={D_GREEN} bold>
            Enter
          </Text>
          <Text color={D_PURPLE}> to continue</Text>
        </Box>
        <Box>
          <Text>{"  "}</Text>
          <Text color={D_COMMENT}>tab / ↑↓ = switch field, esc = back, ctrl-q = cancel</Text>
        </Box>
      </Box>
    </Box>
  );
}
