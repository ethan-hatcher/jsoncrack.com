import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useMantineColorScheme } from "@mantine/core";
import "@mantine/dropzone/styles.css";
import styled, { ThemeProvider } from "styled-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
// import Cookie from "js-cookie";
import { NextSeo } from "next-seo";
import { SEO } from "../constants/seo";
import { darkTheme, lightTheme } from "../constants/theme";
import { Banner } from "../features/Banner";
import { BottomBar } from "../features/editor/BottomBar";
import { FullscreenDropzone } from "../features/editor/FullscreenDropzone";
import { Toolbar } from "../features/editor/Toolbar";
import useGraph from "../features/editor/views/GraphView/stores/useGraph";
import useConfig from "../store/useConfig";
import useFile from "../store/useFile";
import React from "react";
import useJson from "../store/useJson"; // adjust path if your file is placed elsewhere

const ModalController = dynamic(() => import("../features/modals/ModalController"));
const ExternalMode = dynamic(() => import("../features/editor/ExternalMode"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

export const StyledPageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;

  @media only screen and (max-width: 320px) {
    height: 100vh;
  }
`;

export const StyledEditorWrapper = styled.div`
  width: 100%;
  height: 100%;
  overflow: hidden;
`;

export const StyledEditor = styled(Allotment)`
  position: relative !important;
  display: flex;
  background: ${({ theme }) => theme.BACKGROUND_SECONDARY};

  @media only screen and (max-width: 320px) {
    height: 100vh;
  }
`;

const StyledTextEditor = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
`;

const TextEditor = dynamic(() => import("../features/editor/TextEditor"), {
  ssr: false,
});

const LiveEditor = dynamic(() => import("../features/editor/LiveEditor"), {
  ssr: false,
});

const EditorPage = (props) => {
  const { query, isReady } = useRouter();
  const { setColorScheme } = useMantineColorScheme();
  const checkEditorSession = useFile(state => state.checkEditorSession);
  const darkmodeEnabled = useConfig(state => state.darkmodeEnabled);
  const fullscreen = useGraph(state => state.fullscreen);

  // Example editor state / refs in your file:
  // const [editorValue, setEditorValue] = React.useState(initialValue);
  // const monacoRef = React.useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  // local editor state + monaco ref so event handler can update the left editor safely
  const [editorValue, setEditorValue] = React.useState<string>("");
  const monacoRef = React.useRef<any>(null);

  // NOTE: To actually update the Monaco editor inside TextEditor you need to
  // either: (1) expose monacoRef from TextEditor (accept a ref/prop) and set it,
  // or (2) make TextEditor subscribe to the useJson store / "json:update" event.
  // I can patch TextEditor if you paste it.
 
  // subscribe to initial store json so the editor initializes correctly
  const getStoreJson = useJson(state => state.getJson);

  React.useEffect(() => {
    // initial sync from store
    try {
      const initial = getStoreJson ? getStoreJson() : "";
      if (initial && typeof initial === "string") {
        // if you use a plain state for the editor:
        if (typeof setEditorValue === "function") {
          setEditorValue(initial);
        }
        // if you use monaco, set via editor ref:
        if (monacoRef?.current?.setValue) {
          monacoRef.current.setValue(initial);
        }
      }
    } catch {
      // ignore
    }
    // listen for updates emitted by NodeModal
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const newJson = String(detail);

      // avoid clobbering a user edit in progress; you may choose a different policy
      if (typeof setEditorValue === "function") {
        setEditorValue(prev => {
          if (prev === newJson) return prev;
          return newJson;
        });
      }
      if (monacoRef?.current?.setValue) {
        const current = monacoRef.current.getValue?.();
        if (current !== newJson) monacoRef.current.setValue(newJson);
      }
    };
    window.addEventListener("json:update", handler as EventListener);
    return () => window.removeEventListener("json:update", handler as EventListener);
  }, [getStoreJson /*, setEditorValue, monacoRef */]);

  useEffect(() => {
    if (isReady) checkEditorSession(query?.json);
  }, [checkEditorSession, isReady, query]);

  useEffect(() => {
    setColorScheme(darkmodeEnabled ? "dark" : "light");
  }, [darkmodeEnabled, setColorScheme]);

  return (
    <>
      <NextSeo
        {...SEO}
        title="Editor | JSON Crack"
        description="JSON Crack Editor is a tool for visualizing into graphs, analyzing, editing, formatting, querying, transforming and validating JSON, CSV, YAML, XML, and more."
        canonical="https://jsoncrack.com/editor"
      />
      <ThemeProvider theme={darkmodeEnabled ? darkTheme : lightTheme}>
        <QueryClientProvider client={queryClient}>
          <ExternalMode />
          <ModalController />
          <StyledEditorWrapper>
            <StyledPageWrapper>
              {process.env.NEXT_PUBLIC_DISABLE_EXTERNAL_MODE === "true" ? null : <Banner />}
              <Toolbar />
              <StyledEditorWrapper>
                <StyledEditor proportionalLayout={false}>
                  <Allotment.Pane
                    preferredSize={450}
                    minSize={fullscreen ? 0 : 300}
                    maxSize={800}
                    visible={!fullscreen}
                  >
                    <StyledTextEditor>
                      <TextEditor />
                      <BottomBar />
                    </StyledTextEditor>
                  </Allotment.Pane>
                  <Allotment.Pane minSize={0}>
                    <LiveEditor />
                  </Allotment.Pane>
                </StyledEditor>
                <FullscreenDropzone />
              </StyledEditorWrapper>
            </StyledPageWrapper>
          </StyledEditorWrapper>
        </QueryClientProvider>
      </ThemeProvider>
    </>
  );
};

export default EditorPage;
