"""
run_ingestion.py

CLI entry point for the Data Ingestion Layer.

Usage:
    python run_ingestion.py                          # uses config/sample_job.json
    python run_ingestion.py --config config/my_job.json
    python run_ingestion.py --config config/sample_job.json --output json
    python run_ingestion.py --config config/sample_job.json --output pretty --save
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

import structlog
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich import box
from rich.text import Text

# ── Logging setup (before any src imports) ─────────────────────────────────────
structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.dev.ConsoleRenderer(colors=False),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

from src.ingestion.config import JobConfig  # noqa: E402
from src.ingestion.pipeline import IngestionPipeline  # noqa: E402
from src.ingestion.models import IngestionResult, RawPost  # noqa: E402

console = Console()


# ── Display helpers ────────────────────────────────────────────────────────────


def print_header(config: JobConfig) -> None:
    console.print()
    console.print(Panel(
        f"[bold cyan]Reddit Deep Marketing Intelligence[/bold cyan]\n"
        f"[dim]Data Ingestion Layer[/dim]\n\n"
        f"[white]Job ID:[/white]      [yellow]{config.job_id}[/yellow]\n"
        f"[white]Subreddits:[/white]  [green]{', '.join('r/' + s for s in config.ingestion.subreddits)}[/green]\n"
        f"[white]Post limit:[/white]  [cyan]{config.ingestion.post_limit}[/cyan] per subreddit\n"
        f"[white]Sort by:[/white]     [cyan]{config.ingestion.sort_by.value}[/cyan] "
        f"[dim](time filter: {config.ingestion.time_filter.value})[/dim]\n"
        f"[white]Comments:[/white]    {'[green]yes[/green]' if config.ingestion.include_comments else '[dim]no[/dim]'} "
        f"[dim](top {config.ingestion.top_comments_limit})[/dim]",
        title="[bold]⚙  Run Configuration[/bold]",
        border_style="cyan",
        expand=False,
    ))


def print_summary(result: IngestionResult) -> None:
    """Print a concise run summary panel."""
    pass_rate_color = (
        "green" if result.filter_pass_rate > 0.5
        else "yellow" if result.filter_pass_rate > 0.2
        else "red"
    )

    console.print()
    console.print(Panel(
        f"[white]Fetched:[/white]       [bold]{result.total_fetched}[/bold] posts\n"
        f"[white]Passed filters:[/white] [bold {pass_rate_color}]{result.total_passed_filters}[/bold {pass_rate_color}] posts "
        f"[dim]({result.filter_pass_rate:.0%} pass rate)[/dim]\n"
        f"[white]Duration:[/white]      [dim]{result.duration_seconds:.2f}s[/dim]\n"
        f"[white]Errors:[/white]        {'[red]' + str(len(result.errors)) + '[/red]' if result.errors else '[green]0[/green]'}",
        title="[bold]📊  Run Summary[/bold]",
        border_style="green" if not result.errors else "yellow",
        expand=False,
    ))


def print_posts_table(posts: list[RawPost], max_rows: int = 20) -> None:
    """Render collected posts as a rich table."""
    if not posts:
        console.print("\n[yellow]No posts passed the filters.[/yellow]")
        return

    table = Table(
        box=box.ROUNDED,
        show_header=True,
        header_style="bold magenta",
        title=f"[bold]📋 Collected Posts[/bold] [dim]({min(len(posts), max_rows)} of {len(posts)} shown)[/dim]",
        expand=True,
    )

    table.add_column("#", style="dim", width=4, justify="right")
    table.add_column("Subreddit", style="cyan", width=14)
    table.add_column("Title", style="white", ratio=3)
    table.add_column("Score", style="yellow", width=7, justify="right")
    table.add_column("Comments", style="blue", width=9, justify="right")
    table.add_column("Author", style="dim", width=14)
    table.add_column("Date", style="dim", width=12)

    for i, post in enumerate(posts[:max_rows], 1):
        title = post.title[:70] + "…" if len(post.title) > 70 else post.title
        table.add_row(
            str(i),
            f"r/{post.subreddit}",
            title,
            str(post.score),
            str(post.comment_count),
            post.author or "[deleted]",
            post.created_utc.strftime("%Y-%m-%d"),
        )

    console.print()
    console.print(table)


def print_sample_post(post: RawPost) -> None:
    """Show a detailed view of the first post — preview of what downstream layers receive."""
    console.print()
    console.print(Panel(
        f"[bold]{post.title}[/bold]\n\n"
        f"[dim]r/{post.subreddit} • score {post.score} • {post.comment_count} comments • by {post.author or 'unknown'}[/dim]\n\n"
        f"[white]{post.combined_text[:600]}{'…' if len(post.combined_text) > 600 else ''}[/white]",
        title="[bold]🔍 Sample Post — combined_text preview[/bold]",
        subtitle="[dim]This is what flows into the Intent Scoring layer[/dim]",
        border_style="blue",
    ))


def save_result(result: IngestionResult, job_id: str) -> Path:
    """Save IngestionResult as JSON to output/."""
    out_dir = Path("output")
    out_dir.mkdir(exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    path = out_dir / f"{job_id}_{ts}.json"
    path.write_text(result.model_dump_json(indent=2))
    return path


# ── CLI ────────────────────────────────────────────────────────────────────────


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reddit Deep Marketing Intelligence — Data Ingestion Layer",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_ingestion.py
  python run_ingestion.py --config config/sample_job.json --output pretty
  python run_ingestion.py --config config/sample_job.json --output json
  python run_ingestion.py --config config/sample_job.json --save
        """,
    )
    parser.add_argument(
        "--config",
        default="config/sample_job.json",
        help="Path to job config JSON (default: config/sample_job.json)",
    )
    parser.add_argument(
        "--output",
        choices=["pretty", "json", "quiet"],
        default="pretty",
        help="Output format (default: pretty)",
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="Save results to output/<job_id>_<timestamp>.json",
    )
    parser.add_argument(
        "--max-rows",
        type=int,
        default=20,
        help="Max posts to show in table (default: 20)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    # ── Load config ────────────────────────────────────────────────────────────
    config_path = Path(args.config)
    if not config_path.exists():
        console.print(f"[red]✗ Config file not found:[/red] {config_path}")
        return 1

    try:
        config = JobConfig.from_json(str(config_path))
    except Exception as exc:
        console.print(f"[red]✗ Invalid config:[/red] {exc}")
        return 1

    if args.output == "pretty":
        print_header(config)

    # ── Run pipeline ───────────────────────────────────────────────────────────
    try:
        pipeline = IngestionPipeline(config)
        result = pipeline.run()
    except Exception as exc:
        console.print(f"\n[red]✗ Pipeline failed:[/red] {exc}")
        console.print(
            "\n[yellow]Hint:[/yellow] Make sure your [bold].env[/bold] file exists with valid Reddit API credentials.\n"
            "      Copy [dim].env.example → .env[/dim] and fill in your values.\n"
            "      Get credentials at: [link]https://www.reddit.com/prefs/apps[/link]"
        )
        return 1

    # ── Output ─────────────────────────────────────────────────────────────────
    if args.output == "json":
        print(result.model_dump_json(indent=2))

    elif args.output == "pretty":
        print_summary(result)
        print_posts_table(result.posts, max_rows=args.max_rows)
        if result.posts:
            print_sample_post(result.posts[0])

    # quiet: no output, rely on structlog

    # ── Save ───────────────────────────────────────────────────────────────────
    if args.save:
        saved_path = save_result(result, config.job_id)
        console.print(f"\n[green]✓ Results saved →[/green] {saved_path}")

    console.print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
