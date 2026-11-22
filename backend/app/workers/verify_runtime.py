from app.workers.celery_app import runtime_probe_task


def main() -> None:
    result = runtime_probe_task.apply_async(kwargs={"failures_before_success": 1})
    payload = result.get(timeout=30, propagate=True)
    if payload.get("status") != "SUCCESS" or payload.get("retries") != 1:
        raise RuntimeError("Celery broker/worker runtime probe returned an unexpected result")
    print("Celery Redis broker/worker probe passed; task completed after one retry.")


if __name__ == "__main__":
    main()
