from pathlib import Path

page = Path("features/work-orders/app/work-orders/create/page.tsx")
text = page.read_text(encoding="utf-8")

listener = '''  useEffect(() => {
    const handleStaleDraft = (event: Event) => {
      const detail = (event as CustomEvent<{ workOrderId?: string }>).detail;
      if (!detail?.workOrderId || detail.workOrderId !== wo?.id) return;
      setWo(null);
      setLines([]);
      setValidatedWorkOrderId(null);
      setError(STALE_CREATE_WORK_ORDER_MESSAGE);
      toast.error(STALE_CREATE_WORK_ORDER_MESSAGE);
    };
    window.addEventListener(CREATE_WORK_ORDER_STALE_EVENT, handleStaleDraft);
    return () =>
      window.removeEventListener(
        CREATE_WORK_ORDER_STALE_EVENT,
        handleStaleDraft,
      );
  }, [setError, setLines, setWo, wo?.id]);

'''
if listener not in text:
    raise RuntimeError("stale draft listener not found")
text = text.replace(listener, "", 1)

anchor = '''  const [selectedMaintenanceCodes, setSelectedMaintenanceCodes] = useState<
    string[]
  >([]);

'''
if anchor not in text:
    raise RuntimeError("listener insertion anchor not found")
text = text.replace(anchor, anchor + listener, 1)
page.write_text(text, encoding="utf-8")

Path(__file__).unlink(missing_ok=True)
Path(".github/workflows/move-stale-draft-listener.yml").unlink(missing_ok=True)
