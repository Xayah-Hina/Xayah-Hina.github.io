function texEscape(value: string): string {
  const replacements: Record<string, string> = {
    "\\": String.raw`\textbackslash{}`,
    "{": String.raw`\{`,
    "}": String.raw`\}`,
    "$": String.raw`\$`,
    "&": String.raw`\&`,
    "#": String.raw`\#`,
    "_": String.raw`\_`,
    "%": String.raw`\%`,
    "~": String.raw`\textasciitilde{}`,
    "^": String.raw`\textasciicircum{}`,
  };
  return Array.from(value, (character) => replacements[character] || character).join("");
}

export function writingSourceTemplate(id: string, title: string, summary: string): string {
  const titleTex = texEscape(title);
  const summaryTex = texEscape(summary);
  const date = `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}`;
  const summaryBlock = summaryTex
    ? String.raw`\begin{abstract}
${summaryTex}
\end{abstract}`
    : "";
  return String.raw`\documentclass[11pt,twoside,fontset=none,scheme=plain]{ctexart}

\usepackage[
  paperwidth=176mm,
  paperheight=250mm,
  top=21mm,
  bottom=22mm,
  inner=23mm,
  outer=19mm,
  headheight=14pt,
  headsep=7mm,
  footskip=13mm
]{geometry}
\usepackage[nomath,semibold]{libertinus}
\usepackage{microtype}
\usepackage{xcolor}
\usepackage{hyperref}
\usepackage{fancyhdr}

\newcommand{\writingfontpath}{assets/fonts/}
\IfFileExists{assets/fonts/LXGWWenKaiGB-Regular.ttf}{}{%
  \renewcommand{\writingfontpath}{../../assets/fonts/}%
}
\setCJKmainfont[
  Path=\writingfontpath,
  BoldFont=LXGWWenKaiGB-Medium.ttf,
  AutoFakeSlant=0.2
]{LXGWWenKaiGB-Regular.ttf}
\setCJKsansfont[
  Path=\writingfontpath,
  BoldFont=LXGWWenKaiGB-Medium.ttf
]{LXGWWenKaiGB-Medium.ttf}
\setCJKmonofont[
  Path=\writingfontpath,
  BoldFont=LXGWWenKaiGB-Medium.ttf
]{LXGWWenKaiGB-Regular.ttf}
\xeCJKsetup{PunctStyle=kaiming}

\definecolor{bookink}{HTML}{222222}
\definecolor{mutedink}{HTML}{6B6964}
\definecolor{accent}{HTML}{315F86}
\newcommand{\writingtwodigits}[1]{\ifnum#1<10 0\fi\number#1}
\newcommand{\writinglastrevised}{\number\year-\writingtwodigits{\month}-\writingtwodigits{\day}}
\hypersetup{
  unicode=true,
  pdftitle={${titleTex}},
  pdfauthor={Xayah Hina},
  pdfdisplaydoctitle=true,
  colorlinks=true,
  linkcolor=accent,
  urlcolor=accent,
  citecolor=accent
}
\urlstyle{same}

\setlength{\parindent}{2em}
\setlength{\parskip}{0pt}
\linespread{1.28}
\emergencystretch=1.5em
\clubpenalty=10000
\widowpenalty=10000
\displaywidowpenalty=10000
\setcounter{secnumdepth}{3}
\raggedbottom

\ctexset{
  section={
    name={},
    number=\arabic{section},
    format=\Large\sffamily\bfseries\color{bookink},
    aftername=\hspace{0.8em},
    beforeskip=2.6ex plus 0.5ex minus 0.2ex,
    afterskip=1.3ex plus 0.2ex,
    indent=0pt
  },
  subsection={
    name={},
    number=\thesection.\arabic{subsection},
    format=\large\sffamily\bfseries\color{bookink},
    aftername=\hspace{0.75em},
    beforeskip=2.2ex plus 0.4ex minus 0.2ex,
    afterskip=1ex plus 0.2ex,
    indent=0pt
  },
  subsubsection={
    name={},
    number=\thesubsection.\arabic{subsubsection},
    format=\normalsize\sffamily\bfseries\color{bookink},
    aftername=\hspace{0.7em},
    beforeskip=1.8ex plus 0.3ex minus 0.2ex,
    afterskip=0.8ex plus 0.2ex,
    indent=0pt
  }
}

\renewcommand{\abstractname}{摘要}
\renewenvironment{abstract}{%
  \begin{center}
    \small\sffamily\bfseries\color{bookink}\abstractname
  \end{center}
  \begin{list}{}{\leftmargin=2em\rightmargin=2em}
    \item\relax\small\color{mutedink}\noindent\ignorespaces
}{%
  \end{list}
  \vspace{1.2em}
}

\makeatletter
\renewcommand{\maketitle}{%
  \thispagestyle{plain}%
  \begin{center}
    \vspace*{0.6em}
    {\LARGE\sffamily\bfseries\color{bookink}\@title\par}
    \vspace{1em}
    {\small\color{mutedink}\@author\quad\textperiodcentered\quad\@date\par}
  \end{center}
  \vspace{1.8em}
}
\makeatother

\pagestyle{fancy}
\fancyhf{}
\fancyhead[LE]{\footnotesize\color{mutedink}Xayah Hina}
\fancyhead[RO]{\footnotesize\color{mutedink}${titleTex}}
\fancyfoot[LE,RO]{\footnotesize\color{mutedink}\thepage}
\renewcommand{\headrulewidth}{0pt}
\fancypagestyle{plain}{%
  \fancyhf{}
  \fancyfoot[C]{\footnotesize\color{mutedink}\thepage}
  \renewcommand{\headrulewidth}{0pt}
}
\AtBeginDocument{\color{bookink}}

\title{${titleTex}}
\author{Xayah Hina}
\date{${date}\quad\textperiodcentered\quad Last Revised: \writinglastrevised}

\begin{document}
\maketitle

${summaryBlock}
% Begin writing here.

\end{document}
`;
}
