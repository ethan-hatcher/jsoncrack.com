import React from "react";
import type { ModalProps } from "@mantine/core";
import {
  Modal,
  Stack,
  Text,
  ScrollArea,
  Flex,
  CloseButton,
  Button,         //imports a clickable button UI
  Textarea,       //imports a text input area for editing
  Group,          //horizontal layout with spacing
} from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const getJson = useJson(state => state.getJson);
  const setJson = useJson(state => state.setJson);

  // dispatch helper: notify other parts of the app (the left-file editor) the json changed
  const emitJsonUpdate = React.useCallback((jsonString: string) => {
    try {
      window.dispatchEvent(new CustomEvent("json:update", { detail: jsonString }));
    } catch {
      // no-op in environments that block CustomEvent
    }
  }, []);

  const [isEditing, setIsEditing] = React.useState(false);
  const [editedText, setEditedText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // reset editing state when modal is closed or node changes
    setIsEditing(false);
    setEditedText("");
    setError(null);
  }, [opened, nodeData?.id]);

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Group gap="xs">
              {!isEditing && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setEditedText(normalizeNodeData(nodeData?.text ?? []));
                    setIsEditing(true);
                  }}
                >
                  Edit
                </Button>
              )}
              <CloseButton onClick={onClose} />
            </Group>
          </Flex>

          <ScrollArea.Autosize mah={250} maw={600}>
            {!isEditing ? (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            ) : (
              <Stack gap="xs">
                <Textarea
                  minRows={6}
                  value={editedText}
                  onChange={e => setEditedText(e.currentTarget.value)}
                  data-test-id="node-edit-textarea"
                />
                {error && (
                  <Text color="red" fz="xs">
                    {error}
                  </Text>
                )}
                <Group gap="xs">
                  <Button
                    size="xs"
                    onClick={() => {
                      // Cancel edit
                      setIsEditing(false);
                      setEditedText("");
                      setError(null);
                    }}
                    variant="default"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="xs"
                    onClick={() => {
                      // Save edit: attempt to parse and update underlying json
                      try {
                        const currentJson = getJson();
                        const parsedRoot = currentJson ? JSON.parse(currentJson) : {};

                        // determine new value
                        let newValue: any;

                        try {
                          newValue = JSON.parse(editedText);
                        } catch (err) {
                          // if parsing fails and node is a primitive (single value without key), treat as string
                          const nodeRows = nodeData?.text ?? [];
                          if (nodeRows.length === 1 && !nodeRows[0].key) {
                            newValue = editedText;
                          } else {
                            throw new Error("Invalid JSON. Please enter valid JSON for objects/arrays.");
                          }
                        }

                        const path = nodeData?.path ?? [];

                        // helper to traverse to a path and return cursor (parent) and lastKey
                        const traverseToParent = (root: any, fullPath: (string | number)[]) => {
                          if (!fullPath || fullPath.length === 0) return { parent: null, lastKey: null, cursor: root };
                          const parentPath = fullPath.slice(0, -1);
                          const lastKey = fullPath[fullPath.length - 1];
                          let cursor: any = root;
                          for (const seg of parentPath) {
                            cursor = cursor[seg as any];
                          }
                          return { parentPath, lastKey, cursor };
                        };

                        // produce finalJson once and use it both for setJson and emit
                        let finalJson = "";

                        // If editing root
                        if (!path || path.length === 0) {
                          // If both root and newValue are plain objects and the modal represented object fields,
                          // merge keys instead of replacing whole root to preserve other fields.
                          const nodeRows = nodeData?.text ?? [];
                          const isEditingObjectFields = nodeRows.length > 0 && nodeRows.some(r => r.key);
                          if (
                            isEditingObjectFields &&
                            newValue &&
                            typeof newValue === "object" &&
                            !Array.isArray(newValue)
                          ) {
                            const existingRootIsObject =
                              parsedRoot && typeof parsedRoot === "object" && !Array.isArray(parsedRoot);
                            const merged = existingRootIsObject ? { ...parsedRoot, ...newValue } : newValue;
                            finalJson = JSON.stringify(merged, null, 2);
                            setJson(finalJson);
                            emitJsonUpdate(finalJson);
                          } else {
                            finalJson = JSON.stringify(newValue, null, 2);
                            setJson(finalJson);
                            emitJsonUpdate(finalJson);
                          }
                        } else {
                          // non-root edit -> traverse to parent of target
                          const { cursor, lastKey } = traverseToParent(parsedRoot, path);

                          if (cursor === undefined || lastKey === null || lastKey === undefined) {
                            throw new Error("Unable to resolve target path in JSON.");
                          }

                          const nodeRows = nodeData?.text ?? [];
                          const isEditingObjectFields = nodeRows.length > 0 && nodeRows.some(r => r.key);

                          // If target in JSON is an object and we're editing object fields (the modal showed key/value pairs),
                          // merge the provided keys into the existing object instead of replacing it entirely.
                          const target = cursor[lastKey as any];
                          if (
                            isEditingObjectFields &&
                            target &&
                            typeof target === "object" &&
                            !Array.isArray(target) &&
                            newValue &&
                            typeof newValue === "object" &&
                            !Array.isArray(newValue)
                          ) {
                            cursor[lastKey as any] = { ...target, ...newValue };
                          } else if (
                            // special case: user edited a single keyed field but provided a keyed object (rename attempt).
                            // If nodeRows has exactly one keyed row, and newValue is an object with a single different key,
                            // interpret this as a rename of that child key (preserve sibling fields).
                            nodeRows.length === 1 &&
                            nodeRows[0].key &&
                            newValue &&
                            typeof newValue === "object" &&
                            !Array.isArray(newValue) &&
                            Object.keys(newValue).length === 1
                          ) {
                            const oldKey = nodeRows[0].key;
                            const newKey = Object.keys(newValue)[0];
                            const newVal = newValue[newKey];

                            // if target is the parent object that contains oldKey
                            if (typeof cursor[lastKey as any] === "object" && !Array.isArray(cursor[lastKey as any])) {
                              const parentObj = cursor[lastKey as any];
                              // set new key and delete old if different
                              parentObj[newKey] = newVal;
                              if (newKey !== oldKey) delete parentObj[oldKey];
                              cursor[lastKey as any] = parentObj;
                            } else {
                              // fallback to replace
                              cursor[lastKey as any] = newValue;
                            }
                          } else {
                            // default: set/replace the value at the target key/index
                            cursor[lastKey as any] = newValue;
                          }

                          finalJson = JSON.stringify(parsedRoot, null, 2);
                          setJson(finalJson);
                          emitJsonUpdate(finalJson);
                        }

                        // close editor
                        setIsEditing(false);
                        setEditedText("");
                        setError(null);
                        onClose();
                      } catch (err) {
                        const message = err instanceof Error ? err.message : String(err);
                        setError(message);
                      }
                    }}
                  >
                    Save
                  </Button>
                </Group>
              </Stack>
            )}
          </ScrollArea.Autosize>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
