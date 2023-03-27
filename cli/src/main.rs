#![feature(iter_array_chunks)]
use clap::Parser;
use image::imageops;
use image::io::Reader as ImageReader;
use std::process::Command;
use tempfile::tempdir;

/// Simple program to greet a person
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Image Path
    #[arg(short, long)]
    file_path: String,

    /// List of bezels in mm separated by ; and each values in format left_bezel,top_bezel in order
    /// of your monitors from left to right
    #[arg(short, long, default_value = "")]
    bezels: String,
}

struct Monitor {
    name: String,
    pixel_width: u32,
    pixel_height: u32,
    #[allow(dead_code)] // would come in handy for edge cases that are yet not taken into account
    physical_width: u32,
    physical_height: u32,
    x: u32,
    y: u32,
    bezel_x: u32,
    bezel_y: u32,
}

impl Monitor {
    fn dpi(&self) -> f64 {
        self.pixel_height as f64 / self.physical_height as f64
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();

    let output = Command::new("xrandr")
        .arg("--query")
        .output()
        .expect("failed to execute xrandr");
    let stdout = String::from_utf8_lossy(&output.stdout);

    let monitors = parse_monitors(stdout.split('\n'), &args.bezels);
    let min_dpi = monitors
        .iter()
        .map(|monitor| monitor.dpi())
        .min_by(|a, b| a.total_cmp(b))
        .expect("failed to get min dpi");
    let total_width = monitors
        .iter()
        .map(|monitor| monitor.pixel_width + monitor.bezel_x * 2)
        .sum::<u32>();
    let max_height = monitors
        .iter()
        .map(|monitor| monitor.pixel_height + monitor.bezel_y)
        .max()
        .expect("failed to get max height");

    let dir = tempdir()?;
    let img = ImageReader::open(&args.file_path)?
        .decode()?
        .resize_to_fill(total_width, max_height, imageops::FilterType::Lanczos3);
    let mut last_bezel_x = 0;
    for monitor in monitors.iter() {
        let scaling_factor = monitor.dpi() / min_dpi;
        let width = monitor.pixel_width;
        let height = monitor.pixel_height;
        let scaled_height = (height as f64 * scaling_factor) as u32;
        let scaled_width = (width as f64 * scaling_factor) as u32;

        println!(
            "{} {{ height: {} }}, scaling_factor: {}",
            monitor.name, monitor.pixel_height, scaling_factor
        );
        let file_path = dir.path().join(format!("{}.png", monitor.name));
        img.crop_imm(monitor.x, monitor.y, width, height)
            .resize_to_fill(scaled_width, scaled_height, imageops::FilterType::Lanczos3)
            .crop_imm(
                last_bezel_x + monitor.bezel_x,
                (monitor.y as f64 * scaling_factor as f64) as u32 + monitor.bezel_y,
                width,
                height,
            )
            .save(&file_path)?;

        Command::new("xwallpaper")
            .arg("--output")
            .arg(&monitor.name)
            .arg("--maximize")
            .arg(&file_path)
            .output()?;
        last_bezel_x = monitor.bezel_x;
    }
    Ok(())
}

fn parse_monitors<'i, I>(monitors: I, bezels: &str) -> Vec<Monitor>
where
    I: IntoIterator<Item = &'i str>,
{
    let mut monitor_structs: Vec<Monitor> = Vec::new();
    let mut bezels = bezels.split(';');
    for monitor in monitors.into_iter() {
        if monitor.contains(" connected ") {
            let monitor = monitor.split(' ').collect::<Vec<&str>>();
            let name = monitor[0].to_string();

            let _physical_box = monitor.iter().rev().collect::<Vec<_>>();
            let physical_box = _physical_box.chunks(3).next().unwrap();
            let physical_height = physical_box[0];
            let physical_height = physical_height[0..physical_height.len() - 2]
                .parse::<u32>()
                .unwrap();
            let physical_width = physical_box[2];
            let physical_width = physical_width[0..physical_width.len() - 2]
                .parse::<u32>()
                .unwrap();

            let pixel_box = monitor[2]
                .split_once('+')
                .or_else(|| monitor[3].split_once('+'));
            let dimensions: &str;
            let positions: &str;
            match pixel_box {
                None => panic!("malformed modeline"),
                Some(_box) => {
                    dimensions = _box.0;
                    positions = _box.1;
                }
            }
            if let None = pixel_box {
                continue;
            }

            let mut items = dimensions.split('x');
            let pixel_width = items
                .next()
                .expect("failed to get width")
                .parse::<u32>()
                .expect("malformed width");
            let pixel_height = items
                .next()
                .expect("failed to get height")
                .parse::<u32>()
                .expect("malformed height");

            let mut items = positions.split('+');
            let x = items
                .next()
                .expect("failed to get x")
                .parse::<u32>()
                .expect("malformed x");
            let y = items
                .next()
                .expect("failed to get y")
                .parse::<u32>()
                .expect("malformed y");

            let [bezel_x, bezel_y] = if let Some(value) = bezels.next() {
                value
                    .split(',')
                    .array_chunks::<2>()
                    .next()
                    .unwrap_or(["0", "0"])
            } else {
                ["0", "0"]
            }
            .map(|value| value.parse::<u32>().expect("malformed bezel value"));

            monitor_structs.push(Monitor {
                name,
                pixel_width,
                pixel_height,
                physical_width,
                physical_height,
                x,
                y,
                bezel_x,
                bezel_y,
            });
        }
    }
    monitor_structs
}
