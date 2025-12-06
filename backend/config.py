SUBWAY_DATA = {
    "IRT": {
        "lines": ["1", "2", "3", "4", "5", "6", "7"],
        "feeds": [
            "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs" # 1-7, GS
        ]
    },
    "IND": {
        "lines": ["A", "C", "E", "B", "D", "F", "M", "G"],
        "feeds": [
            "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",
            "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm",
            "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g"
        ]
    },
    "BMT": {
        "lines": ["N", "Q", "R", "W", "J", "Z", "L"],
        "feeds": [
            "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
            "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz",
            "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l"
        ]
    }
}
