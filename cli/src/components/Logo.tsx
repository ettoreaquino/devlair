import { Box, Text } from "ink";
import { D_COMMENT, D_FG, D_PINK, D_PURPLE } from "../lib/theme.js";

const BRAND = "d e v l a i r";
const INNER_WIDTH = 48;
const MIN_W_SHORT = 16;

type Decoration = "full" | "medium" | "short";

interface LogoSpec {
  grad: string;
  innerBox: boolean;
  minCols: number;
}

const LOGO_SPECS: Record<Decoration, LogoSpec> = {
  full: { grad: "░░▒▒▓▓██", innerBox: true, minCols: 52 },
  medium: { grad: "░▒▓█", innerBox: false, minCols: 52 },
  short: { grad: "", innerBox: false, minCols: 52 },
};

const CASCADE: Record<Decoration, Decoration[]> = {
  full: ["full", "medium", "short"],
  medium: ["medium", "short"],
  short: ["short"],
};

function resolveDecoration(
  cols: number,
  requested: Decoration = "full",
): { W: number; grad: string; innerBox: boolean } {
  for (const style of CASCADE[requested]) {
    const spec = LOGO_SPECS[style];
    if (cols >= spec.minCols) {
      return { W: INNER_WIDTH, grad: spec.grad, innerBox: spec.innerBox };
    }
  }
  return { W: Math.max(cols - 4, MIN_W_SHORT), grad: "", innerBox: false };
}

function Border({ W, left, right }: { W: number; left: string; right: string }) {
  return (
    <Text color={D_PURPLE}>
      {"  "}
      {left}
      {"─".repeat(W)}
      {right}
    </Text>
  );
}

function ContentRow({ W, children }: { W: number; children: string }) {
  const innerLen = [...children].length;
  const pad = W - innerLen;
  const padL = Math.floor(pad / 2);
  const padR = pad - padL;
  return (
    <Text>
      <Text color={D_PURPLE}>{"  │"}</Text>
      {" ".repeat(padL)}
      {children}
      {" ".repeat(padR)}
      <Text color={D_PURPLE}>{"│"}</Text>
    </Text>
  );
}

function FullLogo({ W, grad }: { W: number; grad: string }) {
  const gradR = [...grad].reverse().join("");
  const gap = W - grad.length - gradR.length - 4;
  const iw = BRAND.length + 4;
  const ib = "═".repeat(iw - 2);
  const pt = Math.floor((W - iw) / 2);
  const pr = W - iw - pt;

  const GradRow = () => (
    <Text>
      <Text color={D_PURPLE}>{"  │"}</Text>
      {"  "}
      <Text color={D_COMMENT}>{grad}</Text>
      {" ".repeat(gap)}
      <Text color={D_COMMENT}>{gradR}</Text>
      {"  "}
      <Text color={D_PURPLE}>{"│"}</Text>
    </Text>
  );

  const InnerRow = ({ content, style }: { content: string; style: string }) => (
    <Text>
      <Text color={D_PURPLE}>{"  │"}</Text>
      {" ".repeat(pt)}
      <Text color={style}>{content}</Text>
      {" ".repeat(pr)}
      <Text color={D_PURPLE}>{"│"}</Text>
    </Text>
  );

  return (
    <Box flexDirection="column">
      <Border W={W} left="╭" right="╮" />
      <GradRow />
      <InnerRow content={`╔${ib}╗`} style={D_PINK} />
      <Text>
        <Text color={D_PURPLE}>{"  │"}</Text>
        {" ".repeat(pt)}
        <Text color={D_PINK}>{"║ "}</Text>
        <Text color={D_FG} bold>
          {BRAND}
        </Text>
        <Text color={D_PINK}>{" ║"}</Text>
        {" ".repeat(pr)}
        <Text color={D_PURPLE}>{"│"}</Text>
      </Text>
      <InnerRow content={`╚${ib}╝`} style={D_PINK} />
      <GradRow />
      <Border W={W} left="╰" right="╯" />
    </Box>
  );
}

function MediumLogo({ W, grad }: { W: number; grad: string }) {
  const gradR = [...grad].reverse().join("");
  const innerLen = grad.length + 2 + BRAND.length + 2 + gradR.length;
  const pad = W - innerLen;
  const padL = Math.floor(pad / 2);
  const padR = pad - padL;

  return (
    <Box flexDirection="column">
      <Border W={W} left="╭" right="╮" />
      <Text>
        <Text color={D_PURPLE}>{"  │"}</Text>
        {" ".repeat(padL)}
        <Text color={D_COMMENT}>{grad}</Text>
        {"  "}
        <Text color={D_FG} bold>
          {BRAND}
        </Text>
        {"  "}
        <Text color={D_COMMENT}>{gradR}</Text>
        {" ".repeat(padR)}
        <Text color={D_PURPLE}>{"│"}</Text>
      </Text>
      <Border W={W} left="╰" right="╯" />
    </Box>
  );
}

function ShortLogo({ W }: { W: number }) {
  return (
    <Box flexDirection="column">
      <Border W={W} left="╭" right="╮" />
      <ContentRow W={W}>{BRAND}</ContentRow>
      <Border W={W} left="╰" right="╯" />
    </Box>
  );
}

export function Logo({ cols }: { cols?: number }) {
  const termCols = cols ?? process.stdout.columns ?? 80;
  const { W, grad, innerBox } = resolveDecoration(termCols);

  if (grad && innerBox) return <FullLogo W={W} grad={grad} />;
  if (grad) return <MediumLogo W={W} grad={grad} />;
  return <ShortLogo W={W} />;
}
